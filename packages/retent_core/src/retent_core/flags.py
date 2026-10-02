"""Flag detectors: turn measured signals into reasoned, timestamped flags with evidence and fixes.

Each detector finds a candidate span from features and cues; severity comes from the engine's
counterfactual (how many more of every 1,000 starters would still be watching at the end of the
span if this problem were neutral), and the explanation lists the signal families behind it.
Wording follows the product voice: sharp editor, evidence first.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from retent_core.contract import (
    EditOp, EditOpKind, Evidence, Fix, Flag, FlagKind, Norm, OpenLoop, PromiseItem, Provenance, Provider, Signal,
)
from retent_core.engine import FAMILIES, Prediction, counterfactual_retention
from retent_core.features import BIN_FEATURES, FeatureSet
from retent_core.text import PAYOFF_CUES, TEMPLATES, content_tokens, fmt_time, has_cue


def _template(kind: str, fs: FeatureSet) -> str:
    langs = [s.lang for s in fs.sentences[:20]]
    lang = max(set(langs), key=langs.count) if langs else "en"
    return TEMPLATES[kind].get(str(lang), TEMPLATES[kind]["en"])

RULES = Provenance(provider=Provider.rules, model="retent-rules", prompt_version="v0")


@dataclass
class Candidate:
    kind: FlagKind
    sent_idx: list[int]
    title: str
    detail: str
    families: list[str]  # BIN_FEATURES names whose negative contribution this flag owns
    related_idx: list[int] | None = None
    ops: list[EditOp] | None = None
    fix_title: str = ""
    fix_rationale: str = ""
    norm: Norm | None = None
    confidence: float = 0.6


def _span(fs: FeatureSet, idx: list[int]) -> tuple[float, float]:
    return fs.sentences[min(idx)].start, fs.sentences[max(idx)].end


def _bins_for(fs: FeatureSet, start: float, end: float) -> np.ndarray:
    edges = fs.bin_edges
    return np.where((edges[1:] > start) & (edges[:-1] < end))[0]


def _quote(fs: FeatureSet, idx: list[int], limit: int = 220) -> str:
    text = " ".join(fs.sentences[i].text for i in sorted(idx))
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def _runs(mask: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    runs, start = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            if i - start >= min_len:
                runs.append((start, i - 1))
            start = None
    return runs


# ── Detectors ────────────────────────────────────────────────────────────────


def detect_late_hook(fs: FeatureSet) -> Candidate | None:
    hook = fs.s("hook")
    first_hook = next((i for i, v in enumerate(hook) if v > 0), None)
    greet = [i for i in range(min(8, len(fs.sentences))) if fs.s("greeting")[i] > 0]
    hook_t = fs.sentences[first_hook].start if first_hook is not None else None
    if hook_t is not None and hook_t > 60:
        # A "hook" cue minutes in isn't the opening hook; treat the opening as hookless.
        first_hook, hook_t = None, None
    if hook_t is not None and hook_t <= 12 and not greet:
        return None
    if first_hook:
        end_idx = first_hook - 1
    else:
        end_idx = max(greet + [max((i for i, s in enumerate(fs.sentences) if s.start < 25.0), default=0)])
    idx = list(range(0, max(0, end_idx) + 1)) or [0]
    span_end = fs.sentences[idx[-1]].end
    if hook_t is None:
        title = "No clear hook in the opening"
        detail = (f"The first {fmt_time(span_end)} never says what the viewer gets or why to stay. "
                  "Viewers decide in the first 30 seconds.")
    else:
        title = f"Intro runs {fmt_time(hook_t)} before the hook"
        detail = (f"The hook lands at {fmt_time(hook_t)}; until then it's "
                  f"{'greetings and ' if greet else ''}set-up. Viewers start leaving before it arrives.")
    ops = []
    if greet:
        ops.append(EditOp(op=EditOpKind.cut, sentence_ids=[fs.sentences[i].id for i in greet]))
    if first_hook is not None and first_hook > 0:
        ops.append(EditOp(op=EditOpKind.move, sentence_ids=[fs.sentences[first_hook].id], after_sentence_id=""))
    if first_hook is None:
        ops.append(EditOp(op=EditOpKind.insert, after_sentence_id="", new_text=_template("tease", fs),
                          note="Open with the payoff: say what the viewer will get, in one line."))
    return Candidate(
        FlagKind.late_hook, idx, title, detail, ["hook", "greeting", "since_last_hook", "novelty"], ops=ops,
        fix_title="Open on the hook" if first_hook else "Write a hook line for 0:00",
        fix_rationale="Lead with the reason to stay; greetings can come after the viewer is committed.",
        confidence=0.75 if hook_t is None or hook_t > 20 else 0.6,
    )


def _semantic(fs: FeatureSet):
    return (fs.extras or {}).get("semantic")


def detect_promise_debt(fs: FeatureSet, title: str) -> tuple[Candidate | None, list[PromiseItem]]:
    sem = _semantic(fs)
    sem_p = next((p for p in (sem.promises if sem else []) if p.get("source") == "title"), None)
    if sem_p is not None:
        pos = {s.id: i for i, s in enumerate(fs.sentences)}
        return _promise_candidate(fs, sem_p["text"], pos.get(sem_p.get("first_touch") or ""),
                                  pos.get(sem_p.get("payoff") or ""), confidence=0.75)
    title_terms = set(content_tokens(title))
    sim = fs.s("promise_sim")
    if not title_terms or len(fs.sentences) < 8:
        return None, []
    # A sentence "touches" the promise when it shares title terms or is close in n-gram space.
    hits = np.array([max(len(title_terms & set(content_tokens(s.text))) / len(title_terms), float(sim[i]) * 1.6)
                     for i, s in enumerate(fs.sentences)])
    thresh = max(0.34, float(np.quantile(hits, 0.85)))
    touch = next((i for i, h in enumerate(hits) if h >= thresh), None)
    # The payoff is where the title's question gets answered: a verdict cue in the back half,
    # else the last strong match.
    half = fs.duration * 0.45
    verdict = [i for i, s in enumerate(fs.sentences) if s.start >= half and has_cue(s.text, PAYOFF_CUES)]
    strong = [i for i, h in enumerate(hits) if h >= max(thresh, float(hits.max()) * 0.8)]
    payoff = verdict[0] if verdict else (strong[-1] if strong else touch)
    return _promise_candidate(fs, title, touch, payoff, confidence=0.6)


def _promise_candidate(fs: FeatureSet, promise: str, touch: int | None, payoff: int | None,
                       confidence: float) -> tuple[Candidate | None, list[PromiseItem]]:
    touch_t = fs.sentences[touch].start if touch is not None else None
    payoff_t = fs.sentences[payoff].start if payoff is not None else None
    status = "unpaid" if payoff_t is None else ("late" if payoff_t > max(60.0, fs.duration * 0.6) else "paid")
    items = [PromiseItem(
        id="p1", text=promise, source="title", first_touch=touch_t, paid_off=payoff_t, status=status,
        evidence_sentence_ids=[fs.sentences[i].id for i in ([touch] if touch is not None else []) +
                               ([payoff] if payoff not in (None, touch) else [])],
    )]
    if touch_t is not None and touch_t <= 30:
        return None, items
    end = touch if touch else max(1, len(fs.sentences) // 3)
    idx = list(range(0, end))
    when = fmt_time(touch_t) if touch_t is not None else "never"
    title_line = (f"Title promise not addressed until {when}" if touch_t is not None
                  else "Title promise never clearly addressed")
    detail = (f"The title promises \u201c{promise}\u201d. Nothing speaks to it until {when}"
              + (f", and the answer only lands at {fmt_time(payoff_t)}." if payoff_t and payoff != touch else ".")
              + " Viewers who clicked for that answer start doubting they'll get it.")
    first_after_greeting = next((i for i in range(len(fs.sentences)) if fs.s("greeting")[i] == 0), 0)
    after = fs.sentences[first_after_greeting - 1].id if first_after_greeting > 0 else ""
    ops = [EditOp(op=EditOpKind.insert, after_sentence_id=after, new_text=_template("tease", fs),
                  note="Tease the answer to the title in one line, early.")]
    return Candidate(
        FlagKind.promise_debt, idx, title_line, detail, ["promise_sim", "topic_sim"], ops=ops,
        fix_title="Tease the answer in the opening",
        fix_rationale="Prove the title's question will be answered, then make them wait for the detail.",
        confidence=confidence,
    ), items


def detect_repetition(fs: FeatureSet) -> list[Candidate]:
    n = len(fs.sentences)
    sim = fs.sim.copy()
    out: list[Candidate] = []
    used: set[int] = set()
    for i in range(n):
        if i in used:
            continue
        prior = sim[i, : max(0, i - 3)]
        if not prior.size:
            continue
        j = int(prior.argmax())
        if prior[j] < 0.6 or len(content_tokens(fs.sentences[i].text)) < 6:
            continue
        # Grow the repeated run forward while the next sentences keep matching nearby earlier ones.
        run, k = [i], i + 1
        while k < n and k - i < 6 and sim[k, max(0, j - 2) : j + 6].max(initial=0) >= 0.45:
            run.append(k)
            k += 1
        related = list(range(j, min(i, j + len(run))))
        a, b = _span(fs, run)
        ra, rb = _span(fs, related)
        if b - a < 4.0 or rb - ra < 3.0:
            continue
        used.update(run)
        out.append(Candidate(
            FlagKind.repetition, run, f"{fmt_time(a)}–{fmt_time(b)} repeats {fmt_time(ra)}–{fmt_time(rb)}",
            f"This section says again what the viewer heard at {fmt_time(ra)} "
            f"(similarity {float(prior[j]):.2f}). Repeats read as stalling.",
            ["redundancy", "novelty"], related_idx=related,
            ops=[EditOp(op=EditOpKind.cut, sentence_ids=[fs.sentences[x].id for x in run])],
            fix_title=f"Cut the repeat at {fmt_time(a)}", fix_rationale="The point already landed once.",
            confidence=min(0.9, 0.45 + float(prior[j]) * 0.5),
        ))
    return out


def detect_tangent(fs: FeatureSet) -> list[Candidate]:
    sem = _semantic(fs)
    if sem is not None:
        mask = np.array([sem.roles.get(x.id) == "tangent" for x in fs.sentences])
        out = []
        for a, b in _runs(mask, 2):
            st, en = fs.sentences[a].start, fs.sentences[b].end
            if en - st < 12:
                continue
            idx = list(range(a, b + 1))
            out.append(Candidate(
                FlagKind.tangent, idx, f"{fmt_time(st)}–{fmt_time(en)} is a detour from the promise",
                "This stretch tells a side story the title never promised. Viewers who came for the answer start "
                "checking the progress bar.",
                ["topic_sim", "promise_sim"],
                ops=[EditOp(op=EditOpKind.cut, sentence_ids=[fs.sentences[x].id for x in idx[1:]]),
                     EditOp(op=EditOpKind.rewrite, sentence_ids=[fs.sentences[idx[0]].id],
                            note="Compress the detour into one line that ties back to the promise.")],
                fix_title="Compress the detour to one line", fix_rationale="Keep the colour, lose the minutes.",
                confidence=0.7,
            ))
        return out[:2]
    topic, promise = fs.s("topic_sim"), fs.s("promise_sim")
    score = topic + promise
    thresh = float(np.quantile(score, 0.18))
    mask = (score <= thresh) & (fs.s("cta") == 0) & (fs.s("sponsor") == 0) & (fs.s("outro") == 0)
    out = []
    for a, b in _runs(mask, 3):
        s, e = fs.sentences[a].start, fs.sentences[b].end
        if e - s < 15 or s < 20:
            continue
        idx = list(range(a, b + 1))
        out.append(Candidate(
            FlagKind.tangent, idx, f"{fmt_time(s)}–{fmt_time(e)} wanders off the topic",
            "These lines share little with the title or the rest of the video. "
            "Viewers who came for the promise read this as a detour.",
            ["topic_sim", "promise_sim"],
            ops=[EditOp(op=EditOpKind.cut, sentence_ids=[fs.sentences[x].id for x in idx[1:]]),
                 EditOp(op=EditOpKind.rewrite, sentence_ids=[fs.sentences[idx[0]].id],
                        note="Compress the detour into one line that ties back to the promise.")],
            fix_title="Compress the detour to one line", fix_rationale="Keep the colour, lose the minutes.",
            confidence=0.5,
        ))
    return out[:2]


def detect_low_density(fs: FeatureSet) -> list[Candidate]:
    nov, fill, wps = fs.s("novelty"), fs.s("filler_rate"), fs.s("wps")
    weak = (nov < np.quantile(nov, 0.3)) & ((fill > 0.04) | (wps < np.quantile(wps, 0.3)))
    out = []
    for a, b in _runs(weak, 3):
        s, e = fs.sentences[a].start, fs.sentences[b].end
        if e - s < 18:
            continue
        idx = list(range(a, b + 1))
        weakest = sorted(idx, key=lambda x: (nov[x], -fill[x]))[: max(1, len(idx) // 2)]
        out.append(Candidate(
            FlagKind.low_density, idx, f"{fmt_time(s)}–{fmt_time(e)} adds little new",
            f"New information drops to {float(nov[a:b+1].mean()) * 100:.0f}% of words here, "
            f"with {float(fill[a:b+1].mean()) * 100:.0f}% fillers. It feels slow even if nothing is wrong.",
            ["novelty", "filler_rate", "wps"],
            ops=[EditOp(op=EditOpKind.trim, sentence_ids=[fs.sentences[x].id for x in sorted(weakest)])],
            fix_title="Tighten this stretch", fix_rationale="Cut the lines that add nothing; jump-cut the rest.",
            confidence=0.55,
        ))
    return out[:2]


def detect_early_ask(fs: FeatureSet) -> list[Candidate]:
    out: list[Candidate] = []
    seen: set[str] = set()
    for i, s in enumerate(fs.sentences):
        is_cta, is_sponsor = fs.s("cta")[i] > 0, fs.s("sponsor")[i] > 0
        kind = "sponsor" if is_sponsor else "cta"
        if not (is_cta or is_sponsor) or kind in seen or s.start > max(90.0, fs.duration * 0.2):
            continue
        seen.add(kind)
        if is_sponsor:
            # A sponsor read usually spans a few lines; take the contiguous block.
            block = [i]
            while block[-1] + 1 < len(fs.sentences) and (fs.s("sponsor")[block[-1] + 1] > 0 or
                                                        fs.sim[i, block[-1] + 1] > 0.3) and len(block) < 5:
                block.append(block[-1] + 1)
        else:
            block = [i]
        what = "Sponsor read" if is_sponsor else "Subscribe ask"
        # Ask right after the payoff (the verdict) when we know where it is; viewers who just got the
        # answer are the ones who subscribe.
        sem = _semantic(fs)
        pay = next((p.get("payoff") for p in (sem.promises if sem else []) if p.get("payoff")), None)
        pos = {x.id: k for k, x in enumerate(fs.sentences)}
        target = pos.get(pay) if pay in pos and pos[pay] > i else next(
            (k for k in range(i + 1, len(fs.sentences)) if fs.s("promise_sim")[k] >= np.quantile(fs.s("promise_sim"), 0.8)), None)
        ops = [EditOp(op=EditOpKind.move, sentence_ids=[fs.sentences[b].id for b in block],
                      after_sentence_id=fs.sentences[target].id if target is not None else fs.sentences[-1].id)]
        out.append(Candidate(
            FlagKind.early_ask, block, f"{what} at {fmt_time(s.start)}, before any value",
            f"The viewer hasn't got anything yet and is already being asked for something. "
            f"{'Sponsor segments are where viewers skip or leave.' if is_sponsor else 'Ask after the first payoff.'}",
            ["sponsor" if is_sponsor else "cta"], ops=ops,
            fix_title=f"Move the {'sponsor read' if is_sponsor else 'ask'} after the first payoff",
            fix_rationale="Viewers who just got value are the ones who subscribe.", confidence=0.7,
        ))
    return out


def detect_premature_wrap(fs: FeatureSet) -> list[Candidate]:
    out = []
    for i, s in enumerate(fs.sentences):
        remaining = fs.duration - s.end
        if fs.s("outro")[i] > 0 and remaining > max(45.0, fs.duration * 0.12):
            out.append(Candidate(
                FlagKind.premature_wrap, [i], f"Wrap-up language at {fmt_time(s.start)} with {fmt_time(remaining)} left",
                "Phrases like this tell viewers the video is over. Many leave here even though content remains.",
                ["outro"],
                ops=[EditOp(op=EditOpKind.rewrite, sentence_ids=[s.id], new_text=_template("bridge", fs),
                            note="Turn the wrap-up into a bridge to what's still coming.")],
                fix_title="Turn the wrap-up into a bridge", fix_rationale="Signal more is coming instead of an ending.",
                confidence=0.7,
            ))
            break
    return out


def detect_open_loops(fs: FeatureSet) -> tuple[list[Candidate], list[OpenLoop]]:
    loops, cands = [], []
    sem = _semantic(fs)
    pos = {x.id: i for i, x in enumerate(fs.sentences)}
    if sem is not None:
        pairs = [(pos[lp["open"]], pos.get(lp.get("close") or "")) for lp in sem.loops if lp["open"] in pos]
    else:
        pairs = []
        for i in [i for i, v in enumerate(fs.s("loop_open")) if v > 0]:
            closes = [k for k in range(i + 1, len(fs.sentences)) if fs.s("loop_close")[k] > 0 or fs.sim[i, k] > 0.45]
            pairs.append((i, closes[0] if closes else None))
    for n, (i, close) in enumerate(sorted(pairs, key=lambda p: p[0])):
        s = fs.sentences[i]
        if close is None:
            status = "unclosed"
        elif fs.sentences[close].start - s.start < 20:
            status = "instant"
        else:
            status = "closed"
        loops.append(OpenLoop(
            id=f"l{n + 1}", opened_at=s.start, closed_at=fs.sentences[close].start if close is not None else None,
            open_text=s.text, close_text=fs.sentences[close].text if close is not None else None, status=status,
        ))
        if status == "unclosed":
            cands.append(Candidate(
                FlagKind.open_loop, [i], f"Loop opened at {fmt_time(s.start)} is never closed",
                "You promise something later and never visibly deliver it. Viewers who stayed for it feel cheated.",
                ["loop_open"],
                ops=[EditOp(op=EditOpKind.rewrite, sentence_ids=[s.id],
                            note="Either pay it off explicitly later, or remove the tease.")],
                fix_title="Close the loop or cut the tease", fix_rationale="Every tease needs a visible payoff.",
                confidence=0.5,
            ))
    return cands, loops


def _sentence_at(fs: FeatureSet, t: float) -> int:
    return min(range(len(fs.sentences)), key=lambda i: abs((fs.sentences[i].start + fs.sentences[i].end) / 2 - t))


def detect_static_shots(fs: FeatureSet) -> list[Candidate]:
    """Rough-cut mode: long stretches with no shot change (from ffmpeg scene detection)."""
    media = (fs.extras or {}).get("media")
    if not media:
        return []
    dur = float(media.get("duration") or fs.duration)
    bounds = [0.0, *sorted(t for t in media.get("cuts", []) if 0 < t < dur), dur]
    out = []
    for a, b in sorted(zip(bounds[:-1], bounds[1:]), key=lambda ab: ab[0] - ab[1]):
        if b - a < 35.0 or len(out) >= 3:
            continue
        idx = [i for i, s in enumerate(fs.sentences) if s.end > a and s.start < b] or [_sentence_at(fs, (a + b) / 2)]
        mid = (a + b) / 2
        out.append(Candidate(
            FlagKind.monotony, idx, f"No visual change {fmt_time(a)}–{fmt_time(b)}",
            f"One unbroken shot for {b - a:.0f} seconds. With nothing new to look at, attention drifts even when the talk is good.",
            ["static_shot"],
            ops=[EditOp(op=EditOpKind.interrupt, sentence_ids=[fs.sentences[_sentence_at(fs, mid)].id],
                        note=f"Add a B-roll cut, a punch-in or on-screen text around {fmt_time(mid)}.")],
            fix_title=f"Break up the shot around {fmt_time(mid)}",
            fix_rationale="A visual change every 10–20 seconds resets attention.", confidence=0.6,
        ))
    return out


def detect_dead_air(fs: FeatureSet) -> list[Candidate]:
    """Rough-cut mode: silences of 3 s or more (from ffmpeg silencedetect)."""
    media = (fs.extras or {}).get("media")
    if not media:
        return []
    dur = float(media.get("duration") or fs.duration)
    out = []
    for s0, s1 in sorted(media.get("silences", []), key=lambda x: x[0] - x[1]):
        if s1 - s0 < 3.0 or s0 < 2.0 or s1 > dur - 2.0 or len(out) >= 3:
            continue
        i = _sentence_at(fs, (s0 + s1) / 2)
        out.append(Candidate(
            FlagKind.low_density, [i], f"{s1 - s0:.0f} s of dead air at {fmt_time(s0)}",
            "Silence with nothing happening on screen is where thumbs start scrolling.",
            ["silence"],
            ops=[EditOp(op=EditOpKind.interrupt, sentence_ids=[fs.sentences[i].id],
                        note=f"Jump-cut the pause at {fmt_time(s0)}–{fmt_time(s1)}.")],
            fix_title=f"Jump-cut the pause at {fmt_time(s0)}", fix_rationale="Tighter pacing, same content.",
            confidence=0.75,
        ))
    return out


def detect_complexity(fs: FeatureSet, category: str) -> list[Candidate]:
    if category != "education":
        return []
    comp = fs.s("complexity")
    mask = comp > max(0.18, float(np.quantile(comp, 0.9)))
    out = []
    for a, b in _runs(mask, 2):
        idx = list(range(a, b + 1))
        s = fs.sentences[a].start
        out.append(Candidate(
            FlagKind.complexity_spike, idx, f"Jargon spike at {fmt_time(s)}",
            "Several heavy terms land back to back without an example. Non-experts drop here.",
            ["complexity"],
            ops=[EditOp(op=EditOpKind.insert, after_sentence_id=fs.sentences[a - 1].id if a else "",
                        note="Add a one-line everyday example before the terms.")],
            fix_title="Add an example before the terms", fix_rationale="Concrete first, abstract second.",
            confidence=0.45,
        ))
    return out[:1]


# ── Assembly ─────────────────────────────────────────────────────────────────


def _severity(viewers_lost: float) -> int:
    for level, cut in ((5, 60), (4, 35), (3, 18), (2, 8)):
        if viewers_lost >= cut:
            return level
    return 1


def build_flags(fs: FeatureSet, pred: Prediction, title: str, category: str
                ) -> tuple[list[Flag], list[Fix], list[PromiseItem], list[OpenLoop]]:
    cands: list[Candidate] = []
    if c := detect_late_hook(fs):
        cands.append(c)
    promise_c, promises = detect_promise_debt(fs, title)
    if promise_c:
        cands.append(promise_c)
    cands += detect_repetition(fs)[:3]
    cands += detect_tangent(fs)
    cands += detect_low_density(fs)
    cands += detect_early_ask(fs)
    cands += detect_premature_wrap(fs)
    loop_cands, loops = detect_open_loops(fs)
    cands += loop_cands[:1]
    cands += detect_complexity(fs, category)
    cands += detect_static_shots(fs)
    cands += detect_dead_air(fs)

    flags: list[Flag] = []
    fixes: list[Fix] = []
    for n, c in enumerate(cands):
        start, end = _span(fs, c.sent_idx)
        mask = _bins_for(fs, start, end)
        if mask.size == 0:
            continue
        cols = [BIN_FEATURES.index(f) for f in c.families]
        cf = counterfactual_retention(pred, mask, cols, neutral_intro=c.kind == FlagKind.late_hook)
        last = int(mask.max())
        viewers_lost = max(0.0, float(cf[last] - pred.retention[last]) * 1000)
        neg = np.minimum(pred.contributions[mask], 0).sum(axis=0)
        total = float(-neg.sum()) or 1.0
        signals = []
        for col in np.argsort(neg)[:4]:
            if neg[col] >= 0:
                continue
            name = BIN_FEATURES[col]
            fam, label = FAMILIES.get(name, (name, name))
            signals.append(Signal(family=fam, label=label, share=round(float(-neg[col]) / total, 3),
                                  value=_signal_value(fs, name, c.sent_idx)))
        fid, xid = f"f{n + 1}", f"x{n + 1}"
        related = c.related_idx or []
        flags.append(Flag(
            id=fid, kind=c.kind, title=c.title, detail=c.detail, start=start, end=end,
            severity=_severity(viewers_lost), viewers_lost=round(viewers_lost, 1), confidence=c.confidence,
            evidence=Evidence(
                sentence_ids=[fs.sentences[i].id for i in c.sent_idx], quote=_quote(fs, c.sent_idx),
                start=start, end=end,
                related_sentence_ids=[fs.sentences[i].id for i in related],
                related_quote=_quote(fs, related) if related else None,
                related_start=_span(fs, related)[0] if related else None,
                related_end=_span(fs, related)[1] if related else None,
            ),
            signals=signals, norm=c.norm, fix_ids=[xid] if c.ops else [], provenance=RULES,
        ))
        if c.ops:
            fixes.append(Fix(id=xid, flag_id=fid, title=c.fix_title, rationale=c.fix_rationale, ops=c.ops,
                             provenance=RULES))
    flags.sort(key=lambda f: -f.viewers_lost)
    return flags, fixes, promises, loops


def _signal_value(fs: FeatureSet, name: str, idx: list[int]) -> str | None:
    if name in ("since_last_hook",):
        return None
    try:
        vals = fs.s(name)[idx]
    except ValueError:
        return None
    if name in ("cta", "sponsor", "outro", "greeting", "hook", "loop_open", "loop_close"):
        return None
    if name == "wps":
        return f"{float(vals.mean()) * 60:.0f} words/min"
    if name in ("novelty", "filler_rate", "complexity"):
        return f"{float(vals.mean()) * 100:.0f}%"
    return f"{float(vals.mean()):.2f}"
