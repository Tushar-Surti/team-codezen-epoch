"""How much to trust a prediction, and why a prediction and YouTube's real curve differ.

Confidence is evidence, not the model grading itself: how well the trained model matched YouTube's
"Most replayed" curve on held-out channels for videos like this one (category × language, written by
retent_ml.train to models/confidence.json). It is lowered when the input is outside what that
evaluation covered: timing estimated from a script, or a length outside 5–15 minutes. Category and
language were the only video properties that clearly predicted accuracy on the held-out set; the
model's own signal strength and the transcript source did not, so they aren't used.

`explain` compares a prediction with the real curve and names where they agree and differ, with the
time, what was said there and the most likely reason (the model reads words only; YouTube's curve
also counts rewatches and reacts to what's on screen).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

from retent_core.contract import Confidence, ConfidenceEvidence

GROUP_LABEL = {
    "tech/en": "Tech · English", "tech/hi": "Tech · Hindi",
    "education/en": "Education · English", "education/hi": "Education · Hindi",
    "vlog/en": "Vlog · English", "vlog/hi": "Vlog · Hindi",
}
EVAL_MIN_S, EVAL_MAX_S = 300.0, 900.0
LEVELS = ("low", "medium", "high")
SUMMARY = {
    "high": "Reliable for where attention rises and falls in videos like this.",
    "medium": "Usually right about the overall shape; individual moments can be off.",
    "low": "Unsure. Treat the drops as hints to check, not as predictions.",
}


def group_key(category: str, language: str | None) -> str:
    # Hindi and Hinglish videos are one group in the training data (Hindi channels mostly speak Hinglish).
    return f"{category}/{'en' if language == 'en' else 'hi'}"


def group_stats(spearmans: list[float], peaks: list[float]) -> dict:
    v = np.asarray(spearmans, dtype=float)
    return {"videos": int(v.size), "median_spearman": round(float(np.median(v)), 3) if v.size else 0.0,
            "share_positive": round(float((v > 0).mean()), 3) if v.size else 0.0,
            "peaks_found": round(float(np.mean(peaks)), 3) if v.size else 0.0}


def level_for(stats: dict) -> str:
    """The same thresholds everywhere: the app, the Blind test and the eval report."""
    if stats["videos"] < 10 or stats["median_spearman"] < 0.18 or stats["share_positive"] < 0.7:
        return "low"
    if stats["median_spearman"] >= 0.28 and stats["share_positive"] >= 0.88 and stats["videos"] >= 20:
        return "high"
    return "medium"


def evidence_sentence(stats: dict, label: str) -> str:
    return (f"On {stats['videos']} {label} videos from channels it never trained on, the predicted shape matched "
            f"YouTube's real \"Most replayed\" curve in {stats['share_positive']:.0%} of them "
            f"(median rank correlation {stats['median_spearman']:+.2f}).")


_calibration: dict[Path, tuple[float, dict]] = {}


def load_calibration(models_dir: Path) -> dict | None:
    path = models_dir / "confidence.json"
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    hit = _calibration.get(path)
    if not hit or hit[0] != mtime:
        _calibration[path] = hit = (mtime, json.loads(path.read_text(encoding="utf-8")))
    return hit[1]


def assess(*, category: str, language: str | None, duration: float, timing: str, model_version: str,
           models_dir: Path) -> Confidence | None:
    if model_version.startswith("heuristic"):
        return Confidence(
            level="low", summary=SUMMARY["low"],
            reasons=["No trained model is loaded, so this curve comes from hand-set rules that were never tested "
                     "against real viewer data."],
            disclaimer="Low confidence: rules-only prediction. Check each flagged moment yourself before editing.")
    cal = load_calibration(models_dir)
    if cal is None or cal.get("model") != model_version:
        return None  # no evidence recorded for this model, so claim nothing
    key = group_key(category, language)
    stats = cal["groups"].get(key)
    label = GROUP_LABEL.get(key, key)
    if not stats:
        stats, label = cal["overall"], "held-out"
    level = level_for(stats)
    reasons: list[str] = []
    if stats["videos"] < 20:
        reasons.append(f"Only {stats['videos']} test videos in this group, so the estimate is rough.")
    if level == "low" and stats["videos"] >= 10:
        reasons.append(f"The model is weakest on {label} videos.")
    lower = 0
    if timing == "estimated":
        lower += 1
        reasons.append("Timing is estimated from speaking rate (script mode); the model was tested on real "
                       "transcripts with measured timing.")
    if not EVAL_MIN_S <= duration <= EVAL_MAX_S:
        lower += 1
        reasons.append(f"It runs {duration / 60:.1f} minutes; the model was tested on 5–15 minute videos.")
    level = LEVELS[max(0, LEVELS.index(level) - lower)]
    disclaimer = None
    if level == "low":
        disclaimer = ("Low confidence: use the flagged drops as hints to check, not as predictions. The curve shows "
                      "where attention may move, and the exact percentages are not calibrated.")
    return Confidence(level=level, summary=SUMMARY[level], evidence_text=evidence_sentence(stats, label),
                      reasons=reasons, disclaimer=disclaimer,
                      evidence=ConfidenceEvidence(group=label, **stats))


# ---------------------------------------------------------------------------------------------
# Why a prediction and the real curve differ


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = a.argsort().argsort().astype(float), b.argsort().argsort().astype(float)
    return float(np.corrcoef(ra, rb)[0, 1]) if ra.std() and rb.std() else 0.0


def _quote(lines: list[tuple[float, str]], t0: float, t1: float, limit: int = 170) -> str:
    text = " ".join(t for (s, t) in lines if t0 <= s < t1).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def verdict(rho: float, miss_rate: float | None = None) -> dict:
    if rho >= 0.4:
        return {"level": "strong", "label": "Strong match", "text": "The prediction follows YouTube's curve closely."}
    if rho >= 0.2:
        return {"level": "partial", "label": "Partial match",
                "text": "The overall shape is right; some moments differ, explained below."}
    if rho >= 0:
        return {"level": "weak", "label": "Weak match",
                "text": "Only the broad shape lines up. The differences below explain the main misses."}
    rate = f" This happens on about {miss_rate:.0%} of held-out videos." if miss_rate is not None else ""
    return {"level": "miss", "label": "Miss", "text": f"The model read this video wrong.{rate} The reasons below show why."}


def _reason(kind: str, i: int, n: int, speech: float, typical: float, quote: str) -> str:
    quiet = typical > 0 and speech < 0.4 * typical
    if kind == "missed_peak":
        if i < 0.05 * n:
            return "Viewers rewatched the opening more than usual for videos like this."
        if quiet:
            return ("Little is said here, so viewers are most likely rewatching something on screen (a demo, a result, "
                    "b-roll). The model only reads the words.")
        if i >= 0.9 * n:
            return ("Near the end, viewers often jump ahead to the verdict or the final result; the words don't "
                    "signal that jump.")
        if re.search(r"\d", quote):
            return ("This stretch is dense with numbers or specs. \"Most replayed\" counts rewatches, and people replay "
                    "facts they want to catch.")
        return ("Nothing in the words marks this moment as special; the draw is probably visual or in the delivery "
                "(tone, humour, a reaction), which a transcript can't show.")
    if i < 0.05 * n:
        return "The model expects the usual opening spike, but this video's viewers didn't rewatch the start."
    if quiet:
        return "The model expected interest to pick up here, but with little being said, viewers moved on."
    return ("The words look engaging here (new information, a question or direct address), but viewers watched it "
            "once without replaying. High interest doesn't always show up as rewatches.")


def explain(model: list[float] | np.ndarray, actual: list[float] | np.ndarray, duration: float,
            lines: list[tuple[float, str]], wps: list[float] | np.ndarray | None = None,
            miss_rate: float | None = None, top: int = 3) -> dict:
    """Where the prediction and YouTube's curve agree and differ (both 100 bins over the video).

    Compared by rank within each video, like the shape-match score: a moment differs when one curve puts it
    near the top and the other near the bottom, however tall either spike is (the model's opening spike is
    always taller, which says nothing on its own)."""
    m, a = np.asarray(model, dtype=float), np.asarray(actual, dtype=float)
    n = len(m)
    rho = _spearman(m, a)
    smooth = lambda v: np.convolve(np.pad(v, 1, mode="edge"), np.ones(3) / 3, mode="valid")  # noqa: E731
    pct = lambda v: smooth(v).argsort().argsort() / max(1, n - 1)  # noqa: E731
    m, a = pct(m), pct(a)
    speech = np.asarray(wps, dtype=float) if wps is not None else np.ones(n)
    typical = float(np.median(speech[speech > 0])) if (speech > 0).any() else 0.0
    edge = lambda k: round(k / n * duration, 1)  # noqa: E731

    used = np.zeros(n, dtype=bool)

    def windows(score: np.ndarray, threshold: float) -> list[tuple[int, int, int]]:
        out = []
        for i in np.argsort(-score):
            if len(out) >= top or score[i] < threshold:
                break
            if used[max(0, i - 3): i + 4].any():
                continue
            lo, hi = max(0, i - 2), min(n - 1, i + 2)
            used[lo: hi + 1] = True
            out.append((int(i), lo, hi))
        return sorted(out, key=lambda w: w[1])

    diff = a - m
    differences = []
    for i, lo, hi in windows(np.abs(diff), 0.45):
        kind = "missed_peak" if diff[i] > 0 else "false_alarm"
        t0, t1 = edge(lo), edge(hi + 1)
        quote = _quote(lines, t0, t1)
        differences.append({
            "start": t0, "end": t1, "kind": kind,
            "title": "YouTube spikes, the model didn't expect it" if kind == "missed_peak"
            else "The model expected a rise, viewers didn't replay it",
            "said": quote or "(no speech here)",
            "reason": _reason(kind, i, n, float(speech[lo: hi + 1].mean()), typical, quote),
        })
    agreements = [{"start": edge(lo), "end": edge(hi + 1), "said": _quote(lines, edge(lo), edge(hi + 1)) or "(no speech here)"}
                  for i, lo, hi in windows(np.minimum(a, m), 0.85)][:2]  # never overlaps a difference
    return {"spearman": round(rho, 3), "verdict": verdict(rho, miss_rate), "differences": differences,
            "agreements": agreements}
