"""End-to-end analysis: sentences → features → prediction → flags → fixes (simulated) → Analysis.

This module is deterministic. The LLM semantic pass (retent_api.llm) enriches sentence roles,
promises and fix text before or after this runs, without changing the shape of the result.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, datetime

import numpy as np

from retent_core.contract import (
    N_BINS, Analysis, Curve, CurveBin, Engine, Fix, KeyMoment, Language, Metrics, ModelInfo, PacingLane,
    Redundancy, Section, Sentence, VideoMeta, Warning_,
)
from retent_core.engine import MODELS_DIR, InterestModel, default_model, key_moments
from retent_core.features import TimedSentence, redundancy_matrix
from retent_core.flags import build_flags
from retent_core.simulator import apply_ops, delta, edited_semantic, run
from retent_core.trust import assess
from retent_core.text import (
    DEFAULT_WPS, content_tokens, detect_language, estimate_seconds, merge_caption_segments, split_script,
)

MIN_DURATION, MAX_DURATION = 300.0, 900.0


def sentences_from_script(script: str, wps: dict[Language, float] | None = None) -> list[TimedSentence]:
    raws = split_script(script)
    out, t = [], 0.0
    for i, r in enumerate(raws):
        lang = detect_language(r.text)
        d = estimate_seconds(r.text, lang, wps or DEFAULT_WPS)
        out.append(TimedSentence(f"s{i:04d}", r.text, t, t + d, lang))
        t += d
    return out


def sentences_from_captions(segments: list[dict]) -> list[TimedSentence]:
    raws = merge_caption_segments(segments)
    out = []
    for i, r in enumerate(raws):
        start, end = float(r.start), float(r.end)
        # ASR caption events overlap; clamp each line to start of the next so time slots don't double count.
        if i + 1 < len(raws) and raws[i + 1].start is not None and raws[i + 1].start > start:
            end = min(end, float(raws[i + 1].start))
        out.append(TimedSentence(f"s{i:04d}", r.text, start, max(end, start + 0.3), detect_language(r.text)))
    return out


def _sections(sents: list[TimedSentence], sim: np.ndarray, duration: float) -> list[Section]:
    """Topic sections where similarity between neighbouring windows dips."""
    n = len(sents)
    if n < 12:
        return []
    w = 4
    cohesion = np.array([sim[max(0, i - w) : i, i : i + w].mean() if 0 < i < n else 1.0 for i in range(n)])
    thresh = float(np.quantile(cohesion[w:-w], 0.2)) if n > 2 * w else 0.0
    bounds = [0]
    for i in range(w, n - w):
        local_min = cohesion[i] <= cohesion[max(0, i - 2) : i + 3].min()
        if local_min and cohesion[i] <= thresh and sents[i].start - sents[bounds[-1]].start >= max(45.0, duration / 12):
            bounds.append(i)
    bounds.append(n)
    sections = []
    for k in range(len(bounds) - 1):
        a, b = bounds[k], bounds[k + 1] - 1
        words = Counter(t for s in sents[a : b + 1] for t in content_tokens(s.text) if len(t) > 3)
        title = " · ".join(w for w, _ in words.most_common(2)) or f"Part {k + 1}"
        sections.append(Section(id=f"sec{k + 1}", kind="topic", title=title, start=sents[a].start, end=sents[b].end))
    return sections


def analyze_sentences(
    sents: list[TimedSentence],
    meta: VideoMeta,
    *,
    model: InterestModel | None = None,
    engine: Engine = Engine.auto,
    synthetic: bool = False,
    timing: str = "estimated",
    chapters: list[dict] | None = None,
    analysis_id: str | None = None,
    semantic=None,
    writer=None,
    media: dict | None = None,
) -> Analysis:
    """`semantic` is the LLM read of the script (retent_core.semantic.Semantic) or None for keyword cues.
    `writer(flags, fixes, payoff_id) -> fixes` fills in fix text (an LLM call) before fixes are simulated."""
    model = model or default_model()
    tail = max(0.0, meta.duration_seconds - max(x.end for x in sents)) if timing == "measured" and meta.duration_seconds else 0.0
    base = run(sents, meta.title, meta.thumbnail_text, meta.category, model, semantic=semantic, tail=tail, media=media)
    fs, pred = base.features, base.prediction
    flags, fixes, promises, loops = build_flags(fs, pred, meta.title, meta.category)

    payoff_id = None
    if promises and promises[0].paid_off is not None:
        payoff_id = next((s.id for s in sents if s.start == promises[0].paid_off), None)
    base = run(sents, meta.title, meta.thumbnail_text, meta.category, model, payoff_id, semantic=semantic, tail=tail, media=media)

    warnings_extra: list[Warning_] = []
    if writer is not None and fixes:
        try:
            fixes = writer(flags, fixes, payoff_id)
        except Exception as exc:  # noqa: BLE001 - keep the rules-engine fixes, say so
            warnings_extra.append(Warning_(code="writer_failed",
                                           message=f"Fix text is from the rules engine: the writing model failed ({str(exc)[:120]})."))

    simulated: list[Fix] = []
    for fx in fixes:
        try:
            after = run(apply_ops(sents, fx.ops), meta.title, meta.thumbnail_text, meta.category, model, payoff_id,
                        semantic=edited_semantic(semantic, fx.ops), tail=tail, media=media)
            simulated.append(fx.model_copy(update={"delta": delta(base, after)}))
        except ValueError:
            simulated.append(fx)

    # Never recommend an edit the model itself expects to hurt: keep the flag, drop the fix.
    def helps(fx: Fix) -> bool:
        d = fx.delta
        return d is None or (d.viewers_at_payoff or 0) > 0 or d.intro_retention > 0.002 or d.watch_time_per_1000 > 5
    dropped = {fx.id for fx in simulated if not helps(fx)}
    simulated = [fx for fx in simulated if fx.id not in dropped]
    flags = [f.model_copy(update={"fix_ids": [x for x in f.fix_ids if x not in dropped]}) for f in flags]

    mid = (fs.bin_edges[:-1] + fs.bin_edges[1:]) / 2
    curve = Curve(
        bins=[CurveBin(index=i, t=round(float(mid[i]), 2), retention=round(float(pred.retention[i]), 4),
                       lo=round(float(pred.lo[i]), 4), hi=round(float(pred.hi[i]), 4),
                       interest=round(float(pred.interest[i]), 3), hazard=round(float(pred.hazard[i]), 5))
              for i in range(N_BINS)],
        typical=None,
        calibration="calibrated" if pred.baseline.calibrated_n else "uncalibrated",
        calibration_n=pred.baseline.calibrated_n,
    )
    m = base.metrics
    metrics = Metrics(
        duration_seconds=round(fs.duration, 1),
        intro_retention=round(m.intro_retention, 4), apv=round(m.apv, 4), avd_seconds=round(m.avd_seconds, 1),
        payoff_time=base.payoff_time,
        payoff_sentence_id=payoff_id,
        viewers_at_payoff=round(pred.at(base.payoff_time) * 1000, 1) if base.payoff_time is not None else None,
        key_moments=[KeyMoment(**k) for k in key_moments(pred)],
    )
    pacing = [
        PacingLane(key="wpm", label="Speaking pace", unit="words/min", values=[round(float(v) * 60, 1) for v in fs.b("wps")]),
        PacingLane(key="info_rate", label="New information", unit="% new words", values=[round(float(v) * 100, 1) for v in fs.b("novelty")]),
        PacingLane(key="filler_rate", label="Fillers", unit="% of words", values=[round(float(v) * 100, 1) for v in fs.b("filler_rate")]),
    ]
    if media:
        dur = float(media.get("duration") or fs.duration)
        cuts = [t for t in media.get("cuts", []) if 0 < t < dur]
        per_bin = np.histogram(cuts, bins=fs.bin_edges)[0] / np.maximum(np.diff(fs.bin_edges) / 60.0, 1e-6)
        pacing.append(PacingLane(key="cut_rate", label="Shot cuts", unit="cuts/min", values=[round(float(v), 1) for v in per_bin]))
        pacing.append(PacingLane(key="silence", label="Silence", unit="% of time", values=[round(float(v) * 100, 1) for v in fs.b("silence")]))
    red = redundancy_matrix(fs)

    if semantic is not None and semantic.sections:
        start_of = {x.id: x.start for x in sents}
        heads = sorted((start_of[sec["start"]], sec["title"]) for sec in semantic.sections if sec["start"] in start_of)
        sections = [Section(id=f"sec{k + 1}", kind="topic", title=title, start=t0,
                            end=heads[k + 1][0] if k + 1 < len(heads) else fs.duration)
                    for k, (t0, title) in enumerate(heads)]
    else:
        sections = _sections(sents, fs.sim, fs.duration)
    for k, ch in enumerate(chapters or []):
        sections.append(Section(id=f"ch{k + 1}", kind="chapter", title=ch.get("title", f"Chapter {k + 1}"),
                                start=float(ch["start_time"]), end=float(ch["end_time"])))

    langs = Counter(s.lang for s in sents)
    warnings = list(warnings_extra)
    if semantic is None:
        warnings.append(Warning_(code="no_semantic_read",
                                 message="Hooks, promises and loops were found with keyword rules; no language model read this script."))
    if not MIN_DURATION <= fs.duration <= MAX_DURATION:
        warnings.append(Warning_(code="out_of_scope_duration",
                                 message=f"This runs {fs.duration / 60:.1f} min. Retent AI is tuned for 5–15 minute videos; "
                                         "treat the curve as indicative."))
    if pred.baseline.calibrated_n == 0:
        warnings.append(Warning_(code="uncalibrated",
                                 message="The absolute level is an uncalibrated prior until it is fitted on real Studio curves. "
                                         "Where the drops are matters more than the exact percentages."))

    return Analysis(
        id=analysis_id or uuid.uuid4().hex[:12],
        created_at=datetime.now(UTC),
        status="complete",
        synthetic=synthetic,
        engine=engine,
        meta=meta.model_copy(update={"duration_seconds": round(fs.duration, 1),
                                     "language": meta.language or langs.most_common(1)[0][0]}),
        sentences=[Sentence(id=s.id, start=round(s.start, 2), end=round(s.end, 2), text=s.text, lang=s.lang,
                            timing=timing, role=(semantic.roles.get(s.id) if semantic else None))
                   for s in sents],
        sections=sections,
        curve=curve,
        metrics=metrics,
        flags=flags,
        fixes=simulated,
        promises=promises,
        loops=loops,
        redundancy=Redundancy(size=red.shape[0], values=[round(float(v), 3) for v in red.ravel()]),
        pacing=pacing,
        model=ModelInfo(version=getattr(model, "version", "heuristic-v0"), trained_on=getattr(model, "trained_on", 0)),
        confidence=assess(category=meta.category, language=meta.language or langs.most_common(1)[0][0],
                          duration=fs.duration, timing=timing, model_version=getattr(model, "version", "heuristic-v0"),
                          models_dir=MODELS_DIR),
        warnings=warnings,
    )
