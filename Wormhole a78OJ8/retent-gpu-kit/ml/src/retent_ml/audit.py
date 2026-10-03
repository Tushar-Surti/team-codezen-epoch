"""Per-record quality audit of D1: is each video's label and text fit to train on?

Checks every record and gives it a verdict (usable / warn / reject) with reasons:
- Label ("Most replayed"): 100 points, spans the video, not flat, normalized.
- Text: covers the video, believable speaking rate, mostly speech (not [Music]), and in the
  language actually spoken (a Hindi channel with English translation captions is flagged).
- Signal: how much of the curve is just "people watch the start", so we know what's left to learn.

Writes data/derived/audit.json and prints a summary. Run:
  uv run --package retent-ml python -m retent_ml.audit
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from retent_core.contract import Language
from retent_core.text import detect_language, tokens

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw" / "d1"
OUT = ROOT / "data" / "derived" / "audit.json"

NON_SPEECH = re.compile(r"^\s*[\[(](music|applause|laughter|संगीत|सस्पेंसफुल म्यूजिक)[\])]\s*$", re.I)


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = a.argsort().argsort(), b.argsort().argsort()
    if ra.std() == 0 or rb.std() == 0:
        return 0.0
    return float(np.corrcoef(ra, rb)[0, 1])


def audit_record(r: dict) -> dict:
    reasons: list[str] = []
    warns: list[str] = []
    dur = float(r["duration"])
    heat = r.get("heatmap") or []
    vals = np.array([h["value"] for h in heat], dtype=float)
    out: dict = {"id": r["id"], "cell": f"{r['category']}/{r['seed_lang']}", "channel": r.get("channel"),
                 "duration": dur, "caption_kind": r["caption"].get("kind"), "caption_status": r["caption"].get("status")}

    # ── Label ──
    if len(vals) < 50:
        reasons.append("heatmap missing")
    else:
        end = heat[-1]["end_time"]
        out["heat_points"] = len(vals)
        out["heat_std"] = round(float(vals.std()), 3)
        out["heat_max"] = round(float(vals.max()), 3)
        if abs(end - dur) > max(5.0, dur * 0.03):
            reasons.append(f"heatmap ends at {end:.0f}s, video is {dur:.0f}s")
        if vals.std() < 0.05:
            reasons.append("heatmap is flat (no signal)")
        if abs(vals.max() - 1.0) > 0.02:
            warns.append("heatmap not normalized to 1.0")
        x = np.linspace(0, 1, len(vals))
        # Share of variance a smooth position trend explains: what's left is what text can explain.
        trend = np.polyval(np.polyfit(np.log1p(x * 20), vals, 2), np.log1p(x * 20))
        resid = vals - trend
        out["position_r2"] = round(1 - float(resid.var() / max(vals.var(), 1e-9)), 3)
        out["start_spike"] = round(float(vals[:3].mean() / max(vals.mean(), 1e-9)), 2)
        out["peaks_after_intro"] = int(((resid > resid.std() * 1.5)[10:]).sum())

    # ── Text ──
    cap = r["caption"]
    segs = cap.get("segments") or []
    if cap.get("status") != "ok" or len(segs) < 20:
        reasons.append(f"no usable text yet ({cap.get('status')})")
    else:
        texts = [s["text"] for s in segs]
        speech = [t for t in texts if not NON_SPEECH.match(t)]
        words = sum(len(tokens(t)) for t in speech)
        span = segs[-1]["end"] - segs[0]["start"]
        coverage = span / dur
        wpm = words / max(1e-6, span / 60)
        out.update(words=words, coverage=round(coverage, 2), wpm=round(wpm), non_speech=round(1 - len(speech) / len(texts), 2))
        if coverage < 0.6:
            reasons.append(f"text covers only {coverage:.0%} of the video")
        elif coverage < 0.85:
            warns.append(f"text covers {coverage:.0%} of the video")
        if wpm < 50:
            reasons.append(f"{wpm:.0f} words/min: mostly non-speech")
        elif wpm < 90 or wpm > 260:
            warns.append(f"unusual pace {wpm:.0f} words/min")
        lang = detect_language(" ".join(speech[:200]))
        out["text_lang"] = str(lang)
        spoken_hi = r.get("seed_lang") == "hi" or (r.get("language") or "").startswith("hi")
        if spoken_hi and lang == Language.en and cap.get("kind") == "manual":
            warns.append("Hindi channel, English captions: likely a translation, not the speech")
        if r.get("seed_lang") == "en" and lang == Language.hi:
            warns.append("English seed but Hindi speech: re-cell")

    out["verdict"] = "reject" if reasons else ("warn" if warns else "usable")
    out["reasons"] = reasons + warns
    return out


def main() -> None:
    rows = [audit_record(json.loads(p.read_text(encoding="utf-8"))) for p in sorted(RAW.glob("*.json"))]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    by_cell: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        by_cell[r["cell"]][r["verdict"]] += 1
    print(f"D1 audit: {len(rows)} records → {OUT.relative_to(ROOT)}\n")
    print(f"{'cell':14s} {'usable':>7s} {'warn':>6s} {'reject':>7s}")
    for cell in sorted(by_cell):
        c = by_cell[cell]
        print(f"{cell:14s} {c['usable']:7d} {c['warn']:6d} {c['reject']:7d}")

    reasons = Counter(re.sub(r"\d+", "N", why) for r in rows for why in r["reasons"])
    print("\nReasons:")
    for why, n in reasons.most_common(12):
        print(f"  {n:4d}  {why}")

    labelled = [r for r in rows if "position_r2" in r]
    if labelled:
        r2 = np.array([r["position_r2"] for r in labelled])
        spike = np.array([r["start_spike"] for r in labelled])
        peaks = np.array([r["peaks_after_intro"] for r in labelled])
        print(f"\nLabel signal over {len(labelled)} curves:")
        print(f"  position trend explains median {np.median(r2):.0%} of curve variance (IQR {np.quantile(r2, .25):.0%}–{np.quantile(r2, .75):.0%})")
        print(f"  start spike: first 3% of the video is median {np.median(spike):.1f}× the video's average")
        print(f"  distinct peaks after the intro: median {np.median(peaks):.0f} per video")
    texted = [r for r in rows if "wpm" in r]
    if texted:
        print(f"\nText over {len(texted)} transcripts: median {np.median([r['wpm'] for r in texted]):.0f} words/min, "
              f"coverage {np.median([r['coverage'] for r in texted]):.0%}, kinds {dict(Counter(r['caption_kind'] for r in texted))}")


if __name__ == "__main__":
    main()
