"""Channel X-Ray: what one channel's real audience does at the same kinds of moments, video after video.

Each video brings YouTube's public "Most replayed" curve (relative interest on a 1% grid) and a timed
transcript. `measure()` finds the moments (intro talk, sponsor reads, subscribe asks, early wrap-ups,
teases, reveals, slow stretches, chapter starts) and keeps the video's own curve. `aggregate()` lines
every moment up at t=0 and asks: does interest fall here, by how much, in how many of this channel's
videos, and how does that compare with the same moment on other channels.

Interest is measured as a residual: the video's curve (z-scored) minus the typical curve shape at that
point in a video, so "people always leave early" is not mistaken for "the sponsor read lost them".
Effects are reported in points on YouTube's own 0–100 Most replayed scale (100 = the video's most
replayed moment). These are associations across a handful of videos, not causal effects; every
pattern carries its n, and is "clear" only when its 90% interval excludes zero.
"""

from __future__ import annotations

import warnings

import numpy as np

from retent_core.contract import N_BINS
from retent_core.engine import predict
from retent_core.features import TimedSentence, build_features
from retent_core.flags import build_flags
from retent_core.text import has_cue

KINDS: dict[str, str] = {
    "intro": "Intro talk before the topic",
    "sponsor": "Sponsor reads",
    "ask": "Subscribe and like asks",
    "wrap": "Wrap-up lines with time still left",
    "tease": "Teases (\"stay till the end\")",
    "reveal": "Reveals and callbacks",
    "slow": "Slow stretches (repeats, tangents, little new)",
    "chapter": "Chapter starts",
}
# A sponsor run needs one unambiguous cue; "thanks to" alone is usually gratitude, not an ad read.
STRONG_SPONSOR = ("sponsor", "use code", "promo code", "discount code", "brought to you by", "partnered with",
                  "affiliate link", "स्पॉन्सर")
OFFSETS = np.arange(-60, 91, 5, dtype=float)  # seconds around each moment for the aligned traces
WINDOW = 30.0  # seconds before/after a moment that its effect is measured over
SAMPLE = 2.0
MIN_VIDEOS = 2  # a "pattern" needs the moment in at least this many videos
MIN_POINTS = 3.0  # smallest effect (Most replayed points) called a pattern


def heat_bins(heat: list[dict], edges: np.ndarray) -> np.ndarray:
    """Resample YouTube's heatmap onto the analysis bin centres (same as training)."""
    xs = np.array([(h["start_time"] + h["end_time"]) / 2 for h in heat])
    ys = np.array([h["value"] for h in heat], dtype=float)
    mids = (edges[:-1] + edges[1:]) / 2
    return np.interp(mids, xs, ys)


def _ranks(v: np.ndarray) -> np.ndarray:
    r = np.empty(len(v))
    r[np.argsort(v, kind="mergesort")] = np.arange(len(v))
    return r


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = _ranks(np.asarray(a, float)), _ranks(np.asarray(b, float))
    if ra.std() == 0 or rb.std() == 0:
        return 0.0
    return float(np.corrcoef(ra, rb)[0, 1])


def _cue_runs(sents: list[TimedSentence], mask: np.ndarray, gap: float = 12.0) -> list[list[int]]:
    runs: list[list[int]] = []
    for i in np.flatnonzero(mask):
        if runs and sents[i].start - sents[runs[-1][-1]].end <= gap:
            runs[-1].append(int(i))
        else:
            runs.append([int(i)])
    return runs


def find_moments(fs, flags, chapters: list[dict] | None) -> list[dict]:
    """Moments in one video: {kind, start, end, text}. Times in seconds."""
    sents, dur = fs.sentences, fs.duration
    s = lambda name: fs.s(name) > 0.5  # noqa: E731
    out: list[dict] = []

    def add(kind: str, start: float, end: float, text: str) -> None:
        out.append({"kind": kind, "start": round(float(start), 1), "end": round(float(max(end, start)), 1),
                    "text": text[:140]})

    early = max(30.0, 0.12 * dur)
    greet = [i for i in np.flatnonzero(s("greeting")) if sents[i].start < early]
    if greet:
        last = max(greet)
        add("intro", 0.0, sents[last].end, sents[greet[0]].text)

    sponsor_spans: list[tuple[float, float]] = []
    for run in _cue_runs(sents, s("sponsor"), gap=20.0):
        if any(has_cue(sents[i].text, STRONG_SPONSOR) for i in run):
            a, b = sents[run[0]].start, sents[run[-1]].end
            sponsor_spans.append((a - 5, b + 5))
            add("sponsor", a, b, sents[run[0]].text)

    for run in _cue_runs(sents, s("cta")):
        a = sents[run[0]].start
        if not any(lo <= a <= hi for lo, hi in sponsor_spans):
            add("ask", a, sents[run[-1]].end, sents[run[0]].text)

    for i in np.flatnonzero(s("outro")):
        t = sents[i].start
        if t >= 0.5 * dur and dur - t >= 0.10 * dur:
            add("wrap", t, sents[i].end, sents[i].text)
            break

    for run in _cue_runs(sents, s("loop_open")):
        add("tease", sents[run[0]].start, sents[run[-1]].end, sents[run[0]].text)
    for run in _cue_runs(sents, s("loop_close")):
        if sents[run[0]].start >= 0.15 * dur:
            add("reveal", sents[run[0]].start, sents[run[-1]].end, sents[run[0]].text)

    for f in flags:
        if f.kind in ("low_density", "repetition", "tangent"):
            add("slow", f.start, f.end, f.title)

    for ch in chapters or []:
        t = float(ch.get("start_time") or 0)
        if 5 < t < dur - 20:
            add("chapter", t, t, ch.get("title") or "Chapter")
    return sorted(out, key=lambda m: m["start"])


def _habits(fs, moments: list[dict], chapters: list[dict] | None) -> dict:
    dur = fs.duration
    words = sum(len(x.text.split()) for x in fs.sentences)
    speaking = sum(max(0.0, x.end - x.start) for x in fs.sentences) or dur
    first = lambda k: next((m for m in moments if m["kind"] == k), None)  # noqa: E731
    intro, sponsor, ask, wrap = first("intro"), first("sponsor"), first("ask"), first("wrap")
    return {
        "duration_min": round(dur / 60, 2),
        "has_intro": bool(intro),
        "intro_s": round(intro["end"], 1) if intro else None,
        "wpm": round(words / speaking * 60, 1),
        "has_sponsor": bool(sponsor),
        "sponsor_at_pct": round(sponsor["start"] / dur * 100, 1) if sponsor else None,
        "sponsor_len_s": round(sponsor["end"] - sponsor["start"], 1) if sponsor else None,
        "asks": sum(m["kind"] == "ask" for m in moments),
        "first_ask_s": round(ask["start"], 1) if ask else None,
        "wrap_left_pct": round((dur - wrap["start"]) / dur * 100, 1) if wrap else None,
        "has_chapters": bool(chapters),
        "slow_share": round(sum(m["end"] - m["start"] for m in moments if m["kind"] == "slow") / dur * 100, 1),
    }


def measure(sents: list[TimedSentence] | None, title: str, duration: float, heat: list[dict], category: str,
            chapters: list[dict] | None = None) -> dict:
    """One video → its curve (z-scored, 100 bins), moments, habits and how well the model read it.
    Without a transcript only the curve is kept (it still counts towards the channel's shape)."""
    edges = np.linspace(0.0, duration, N_BINS + 1)
    out: dict = {"duration": round(float(duration), 1), "has_transcript": bool(sents)}
    if sents:
        fs = build_features(sents, title, duration=duration)
        pred = predict(fs, category)
        flags, _, _, _ = build_flags(fs, pred, title, category)
        edges, duration = fs.bin_edges, fs.duration
        moments = find_moments(fs, flags, chapters)
        out.update(moments=moments, habits=_habits(fs, moments, chapters))
    y = heat_bins(heat, edges)
    out["duration"] = round(float(duration), 1)
    out["heat"] = [round(float(v), 4) for v in y]
    out["z"] = [round(float(v), 4) for v in (y - y.mean()) / (y.std() + 1e-9)]
    out["rel"] = round(float(y.std() / max(y.max(), 1e-9)), 4)  # 1σ in units of the 0–1 Most replayed scale
    if sents:
        out["fit"] = round(spearman(pred.interest, y), 3)
    return out


# ---------------------------------------------------------------------------------------------
# Aggregation


def _smooth(v: np.ndarray, w: int = 3) -> np.ndarray:
    return np.convolve(np.pad(v, w // 2, mode="edge"), np.ones(w) / w, mode="valid")


def typical_shape(videos: list[dict]) -> np.ndarray:
    return _smooth(np.mean([v["z"] for v in videos], axis=0)) if videos else np.zeros(N_BINS)


def _residual_fn(v: dict, typical: np.ndarray):
    dur = v["duration"]
    mids = (np.arange(N_BINS) + 0.5) / N_BINS * dur
    r = np.asarray(v["z"]) - typical

    def at(ts: np.ndarray) -> np.ndarray:
        vals = np.interp(ts, mids, r)
        return np.where((ts >= 0) & (ts <= dur), vals, np.nan)

    return at


def _moment_effect(m: dict, at, dur: float) -> float | None:
    """Mean residual just after the moment minus just before (σ). Intro: interest in the 30 s after the
    intro talk ends vs the typical video at that point (the first seconds are everyone pressing play)."""
    a = m["start"]
    if m["kind"] == "intro":
        return float(np.nanmean(at(np.arange(max(m["end"], 10.0), max(m["end"], 10.0) + WINDOW, SAMPLE))))
    if a < 10 or dur - a < 10:
        return None
    after_len = min(max(WINDOW, m["end"] - a), 60.0)
    before = at(np.arange(a - WINDOW, a, SAMPLE))
    after = at(np.arange(a, a + after_len, SAMPLE))
    if np.isnan(before).all() or np.isnan(after).all():
        return None
    return float(np.nanmean(after) - np.nanmean(before))


def per_video_effects(v: dict, typical: np.ndarray) -> dict[str, dict]:
    """kind → {effect σ, effect %, trace} averaged over that kind's moments in one video."""
    if not v.get("moments"):
        return {}
    at = _residual_fn(v, typical)
    by: dict[str, dict] = {}
    for m in v["moments"]:
        e = _moment_effect(m, at, v["duration"])
        if e is None:
            continue
        t0 = m["end"] if m["kind"] == "intro" else m["start"]  # intro traces are aligned on where the talk ends
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            before = 0.0 if m["kind"] == "intro" else np.nanmean(at(np.arange(t0 - WINDOW, t0, SAMPLE)))
        trace = at(t0 + OFFSETS) - before
        d = by.setdefault(m["kind"], {"effects": [], "traces": [], "n": 0})
        d["effects"].append(e)
        d["traces"].append(trace)
        d["n"] += 1
    out = {}
    for k, d in by.items():
        eff = float(np.mean(d["effects"]))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            trace = np.nanmean(np.vstack(d["traces"]), axis=0)
        out[k] = {"effect": eff, "pts": eff * v["rel"] * 100, "trace": trace, "n": d["n"]}
    return out


def _ci(values: list[float], seed: int = 0) -> tuple[float, float]:
    if len(values) < 3:
        return float("nan"), float("nan")
    rng = np.random.default_rng(seed)
    arr = np.asarray(values)
    means = arr[rng.integers(0, len(arr), (2000, len(arr)))].mean(axis=1)
    return float(np.percentile(means, 5)), float(np.percentile(means, 95))


def _nan_list(a: np.ndarray, nd: int = 3) -> list[float | None]:
    return [None if not np.isfinite(x) else round(float(x), nd) for x in a]


def _median(xs: list) -> float | None:
    xs = [x for x in xs if x is not None]
    return round(float(np.median(xs)), 1) if xs else None


HABIT_ROWS = (
    # key, label, how to summarise across videos, unit
    ("duration_min", "Video length", "median", "min"),
    ("has_intro", "Videos that open with a greeting", "share", "%"),
    ("intro_s", "Greeting runs until", "median", "s"),
    ("wpm", "Speaking pace", "median", "words/min"),
    ("has_sponsor", "Videos with a sponsor read", "share", "%"),
    ("sponsor_at_pct", "Sponsor read starts at", "median", "% in"),
    ("sponsor_len_s", "Sponsor read length", "median", "s"),
    ("asks", "Subscribe/like asks per video", "median", ""),
    ("first_ask_s", "First ask at", "median", "s"),
    ("wrap_left_pct", "Video left after the first wrap-up line", "median", "%"),
    ("has_chapters", "Videos with chapters", "share", "%"),
    ("slow_share", "Time in slow stretches", "median", "%"),
)


def _habit_value(videos: list[dict], key: str, how: str) -> float | None:
    vals = [v["habits"].get(key) for v in videos if v.get("habits")]
    if not vals:
        return None
    if how == "share":
        return round(100 * sum(bool(x) for x in vals) / len(vals), 0)
    return _median(vals)


def aggregate(channel: list[dict], others: list[dict]) -> dict:
    """`channel` and `others` are measure() outputs (plus id/title/meta). Returns the report body."""
    typical = typical_shape(others if len(others) >= 10 else others + channel)
    with_text = [v for v in channel if v.get("moments") is not None]
    ch_eff = [per_video_effects(v, typical) for v in with_text]
    ot_eff = [per_video_effects(v, typical) for v in others if v.get("moments") is not None]

    patterns = []
    for kind, label in KINDS.items():
        rows = [(v, e[kind]) for v, e in zip(with_text, ch_eff) if kind in e]
        if not rows:
            continue
        pcts = [e["pts"] for _, e in rows]
        mean = float(np.mean(pcts))
        same_sign = sum((p < 0) == (mean < 0) for p in pcts) / len(pcts)
        lo, hi = _ci(pcts)
        other = [e[kind]["pts"] for e in ot_eff if kind in e]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            trace = np.nanmean(np.vstack([e["trace"] for _, e in rows]), axis=0) * float(np.mean([v["rel"] for v, _ in rows])) * 100
            other_trace = (np.nanmean(np.vstack([e[kind]["trace"] for e in ot_eff if kind in e]), axis=0) * 100
                           * float(np.mean([v["rel"] for v in others if v.get("moments") is not None] or [0.3]))
                           if other else np.full(len(OFFSETS), np.nan))
        enough = len(rows) >= MIN_VIDEOS
        steady = same_sign >= 0.65
        if enough and steady and mean <= -MIN_POINTS:
            verdict = "hurts"
        elif enough and steady and mean >= MIN_POINTS:
            verdict = "helps"
        else:
            verdict = "mixed"
        clear = verdict != "mixed" and not np.isnan(lo) and (hi < 0 if mean < 0 else lo > 0)
        patterns.append({
            "kind": kind, "label": label, "verdict": verdict, "strength": "clear" if clear else "early",
            "videos": len(rows), "moments": int(sum(e["n"] for _, e in rows)), "of_videos": len(with_text),
            "effect_pts": round(mean, 1), "ci_pts": None if np.isnan(lo) else [round(lo, 1), round(hi, 1)],
            "consistency": round(same_sign, 2),
            "per_video": [{"id": v["id"], "pts": round(e["pts"], 1)} for v, e in rows],
            "typical_pts": round(float(np.mean(other)), 1) if other else None,
            "typical_videos": len(other),
            "offsets": OFFSETS.tolist(),
            "trace": _nan_list(trace, 1),
            "typical_trace": _nan_list(other_trace, 1),
            "examples": [{"id": v["id"], "start": m["start"], "text": m["text"]}
                         for v, _ in rows[:3] for m in v["moments"] if m["kind"] == kind][:3],
        })
    order = {"hurts": 0, "helps": 1, "mixed": 2}
    # Within a verdict: biggest effect weighted by how often the moment happens on this channel.
    patterns.sort(key=lambda p: (order[p["verdict"]], p["strength"] != "clear", -abs(p["effect_pts"]) * p["videos"] / max(1, p["of_videos"])))

    z = np.array([v["z"] for v in channel])
    mean_z = _smooth(z.mean(axis=0))
    shape = {
        "channel": _nan_list(mean_z, 3),
        "p25": _nan_list(_smooth(np.percentile(z, 25, axis=0)), 3),
        "p75": _nan_list(_smooth(np.percentile(z, 75, axis=0)), 3),
        "typical": _nan_list(typical, 3),
        "zones": _zones(mean_z - typical, with_text),
    }
    habits = [{"key": k, "label": label, "unit": unit,
               "channel": _habit_value(with_text, k, how),
               "typical": _habit_value([v for v in others if v.get("habits")], k, how)}
              for k, label, how, unit in HABIT_ROWS]
    fits = [v["fit"] for v in with_text if v.get("fit") is not None]
    return {
        "patterns": patterns,
        "shape": shape,
        "habits": habits,
        "model_fit": round(float(np.mean(fits)), 3) if fits else None,
        "advice": advice(patterns, {h["key"]: h for h in habits}),
        "baseline_videos": len(others),
        "baseline_channels": len({v.get("channel_id") for v in others}),
    }


def _zones(diff: np.ndarray, videos: list[dict], thresh: float = 0.3, min_len: int = 6) -> list[dict]:
    """Stretches (in % of the video) where this channel's curve sits well below or above typical."""
    zones = []
    for sign in (-1, 1):
        mask = sign * diff > thresh
        i = 0
        while i < N_BINS:
            if mask[i]:
                j = i
                while j < N_BINS and mask[j]:
                    j += 1
                if j - i >= min_len and i >= 3:
                    kinds: dict[str, int] = {}
                    for v in videos:
                        for m in v.get("moments") or []:
                            if i <= m["start"] / v["duration"] * 100 < j and m["kind"] != "chapter":
                                kinds[m["kind"]] = kinds.get(m["kind"], 0) + 1
                    common = max(kinds, key=kinds.get) if kinds else None
                    zones.append({"from_pct": i, "to_pct": j, "direction": "below" if sign < 0 else "above",
                                  "size": round(float(np.abs(diff[i:j]).mean()), 2), "common_moment": common})
                i = j
            else:
                i += 1
    return sorted(zones, key=lambda z: z["from_pct"])


def _fmt_s(s: float | None) -> str:
    if s is None:
        return "?"
    s = int(round(s))
    return f"{s // 60}:{s % 60:02d}"


def advice(patterns: list[dict], habits: dict[str, dict]) -> list[dict]:
    """Plain next-video advice from the patterns that hurt (and one to keep doing). Rules, not a model."""
    h = lambda k: habits.get(k, {}).get("channel")  # noqa: E731
    t = lambda k: habits.get(k, {}).get("typical")  # noqa: E731
    out = []
    for p in patterns:
        if p["verdict"] != "hurts":
            continue
        cost = f"interest falls {abs(p['effect_pts']):.0f} points here in {round(p['consistency'] * p['videos'])} of {p['videos']} videos"
        k = p["kind"]
        if k == "intro":
            text = (f"Get to the topic sooner. Your greeting runs to {_fmt_s(h('intro_s'))}"
                    + (f" (other channels: {_fmt_s(t('intro_s'))})" if t("intro_s") is not None else "")
                    + ". Open on the question or result, greet later or not at all.")
        elif k == "sponsor":
            text = (f"Move the sponsor read after the first payoff. Yours start {h('sponsor_at_pct') or '?'}% in and run "
                    f"{_fmt_s(h('sponsor_len_s'))}; tie it to the topic and keep it under 0:45.")
        elif k == "ask":
            text = (f"Ask for the subscribe after you've delivered something. Your first ask lands at "
                    f"{_fmt_s(h('first_ask_s'))}; move it to just after a reveal.")
        elif k == "wrap":
            text = (f"Don't sound like you're ending before you are. Your first wrap-up line comes with "
                    f"{h('wrap_left_pct') or '?'}% of the video left; save it for the last 30 seconds.")
        elif k == "tease":
            text = "Your teases aren't holding people. Make them concrete (what exactly is coming, and when) or cut them."
        elif k == "slow":
            text = (f"Tighten the slow stretches ({h('slow_share') or 0}% of your runtime): cut repeats and tangents, "
                    "or cover them with a pattern interrupt.")
        elif k == "chapter":
            text = ("Interest drops as each new chapter starts: the chapter title tells people what's next and some "
                    "skip it. Open every chapter on its strongest line, not a recap.")
        elif k == "reveal":
            text = "Interest drops after your reveals: people leave once the answer lands. Open the next question right before you give it."
        else:
            continue
        out.append({"kind": k, "text": text, "evidence": cost, "effect_pts": p["effect_pts"]})
        if len(out) == 3:
            break
    keep = next((p for p in patterns if p["verdict"] == "helps"), None)
    if keep:
        out.append({"kind": keep["kind"], "keep": True,
                    "text": f"Keep doing this: {keep['label'].lower()} lift interest by {keep['effect_pts']:.0f} points on your channel.",
                    "evidence": f"in {round(keep['consistency'] * keep['videos'])} of {keep['videos']} videos",
                    "effect_pts": keep["effect_pts"]})
    return out
