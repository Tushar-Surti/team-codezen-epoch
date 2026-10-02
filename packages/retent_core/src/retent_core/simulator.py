"""Counterfactual edits: apply edit ops to the script, re-time it, re-run the engine, report the delta.

Gains are reported as viewers still watching at the payoff and total watch time, not only APV,
because cutting time raises APV on its own.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from retent_core.contract import Delta, EditOp, EditOpKind, Language
from retent_core.engine import CurveMetrics, InterestModel, Prediction, predict, summarize
from retent_core.features import FeatureSet, TimedSentence, build_features
from retent_core.text import CTA_CUES, OUTRO_CUES, SPONSOR_CUES, detect_language, estimate_seconds


@dataclass
class SimResult:
    sentences: list[TimedSentence]
    features: FeatureSet
    prediction: Prediction
    metrics: CurveMetrics
    payoff_time: float | None


def _strip_cues(text: str) -> str:
    out = text
    for cue in OUTRO_CUES + CTA_CUES + SPONSOR_CUES:
        out = re.sub(re.escape(cue), "", out, flags=re.I)
    return re.sub(r"\s+", " ", out).strip(" ,.-") or text


def apply_ops(sentences: list[TimedSentence], ops: list[EditOp]) -> list[TimedSentence]:
    """Return the edited script, re-timed so it plays back-to-back from 0:00."""
    order = [s.id for s in sentences]
    by_id = {s.id: s for s in sentences}
    text = {s.id: s.text for s in sentences}
    # Each sentence owns the slot until the next one starts: speech plus its trailing pause.
    dur, gaps = {}, {}
    for i, s in enumerate(sentences):
        slot = (sentences[i + 1].start - s.start) if i + 1 < len(sentences) else (s.end - s.start)
        slot = max(0.3, slot)
        dur[s.id] = min(max(0.3, s.end - s.start), slot)
        gaps[s.id] = slot - dur[s.id]
    lang = {s.id: s.lang for s in sentences}
    new_n = 0

    def place(ids: list[str], after: str | None) -> None:
        for sid in ids:
            if sid in order:
                order.remove(sid)
        pos = 0 if not after else (order.index(after) + 1 if after in order else len(order))
        order[pos:pos] = ids

    for op in ops:
        ids = [i for i in op.sentence_ids if i in order]
        if op.op in (EditOpKind.cut, EditOpKind.trim):
            for sid in ids:
                order.remove(sid)
        elif op.op == EditOpKind.move and ids:
            place(ids, op.after_sentence_id)
        elif op.op == EditOpKind.insert and op.new_text:
            new_n += 1
            sid = f"n{new_n:03d}"
            text[sid] = op.new_text
            lang[sid] = detect_language(op.new_text)
            dur[sid] = estimate_seconds(op.new_text, Language(lang[sid]))
            gaps[sid] = 0.25
            place([sid], op.after_sentence_id)
        elif op.op == EditOpKind.rewrite and ids:
            first = ids[0]
            if op.new_text:
                text[first] = op.new_text
                dur[first] = estimate_seconds(op.new_text, Language(lang[first]))
            else:
                # Rules-only fallback: no rewritten text yet, so neutralize the cue that causes the drop.
                text[first] = _strip_cues(text[first])
                dur[first] = min(dur[first], estimate_seconds(text[first], Language(lang[first])))
            for sid in ids[1:]:
                order.remove(sid)
        # interrupt / rechapter change visuals or metadata, not the script timeline.

    out: list[TimedSentence] = []
    t = 0.0
    for sid in order:
        out.append(TimedSentence(sid, text[sid], t, t + dur[sid], Language(lang[sid])))
        t += dur[sid] + gaps.get(sid, 0.0)
    _ = by_id
    return out


def edited_semantic(semantic, ops: list[EditOp]):
    """Semantic labels for an edited script: rewritten lines lose their old role; lines inserted at the
    very start (hook or tease) count as the hook. Mirrors apply_ops' numbering of new lines."""
    if semantic is None:
        return None
    import copy

    sem = copy.copy(semantic)
    sem.roles = dict(semantic.roles)
    known = set(getattr(semantic, "known_ids", None) or semantic.roles.keys()) | {
        sid for op in ops for sid in op.sentence_ids}
    n = 0
    for op in ops:
        if op.op == EditOpKind.rewrite and op.sentence_ids:
            sem.roles.pop(op.sentence_ids[0], None)
        elif op.op == EditOpKind.insert and op.new_text:
            n += 1
            sid = f"n{n:03d}"
            known.add(sid)
            if op.after_sentence_id == "" or (op.note and any(w in op.note.lower() for w in ("hook", "tease", "payoff"))):
                sem.roles[sid] = "hook"
    sem.known_ids = known
    return sem


def run(sentences: list[TimedSentence], title: str, thumbnail_text: str | None, category: str,
        model: InterestModel | None = None, payoff_id: str | None = None, semantic=None,
        tail: float = 0.0, media: dict | None = None) -> SimResult:
    """`tail` is real video time after the last spoken line (outro, end screen); it keeps the
    timeline aligned with YouTube's for published videos and is preserved across edits."""
    end = max(x.end for x in sentences)
    fs = build_features(sentences, title, thumbnail_text, semantic=semantic, duration=end + tail if tail else None,
                        media=media)
    pred = predict(fs, category, model)
    payoff = next((s.start for s in sentences if s.id == payoff_id), None) if payoff_id else None
    return SimResult(sentences, fs, pred, summarize(pred), payoff)


def delta(before: SimResult, after: SimResult) -> Delta:
    def at(sim: SimResult) -> float | None:
        return sim.prediction.at(sim.payoff_time) * 1000 if sim.payoff_time is not None else None

    vb, va = at(before), at(after)
    return Delta(
        intro_retention=round(after.metrics.intro_retention - before.metrics.intro_retention, 4),
        apv=round(after.metrics.apv - before.metrics.apv, 4),
        avd_seconds=round(after.metrics.avd_seconds - before.metrics.avd_seconds, 1),
        viewers_at_payoff=round(va - vb, 1) if va is not None and vb is not None else None,
        runtime_seconds=round(after.features.duration - before.features.duration, 1),
        watch_time_per_1000=round((after.metrics.avd_seconds - before.metrics.avd_seconds) * 1000 / 60, 1),
    )
