"""Data card: every number computed from data/raw, written to docs/DATA_CARD.md.

Regenerate after each collection run (or after `hub pull`, to describe the team's full dataset):
  uv run --package retent-ml python -m retent_ml.datacard
"""

from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from datetime import UTC, datetime

from retent_ml.collect import MIN_AGE_DAYS, MAX_S, MIN_S, OUT_DIR as D1_DIR, PROBED_LOG, ROOT

D2_DIR = ROOT / "data" / "raw" / "d2"
D3_DIR = ROOT / "data" / "raw" / "d3"
OUT = ROOT / "docs" / "DATA_CARD.md"
CELLS = [f"{c}/{l}" for c in ("tech", "education", "vlog") for l in ("en", "hi")]
TARGET_PER_CELL = 200


def _load(folder) -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))] if folder.exists() else []


def _med(xs: list[float]) -> str:
    return f"{statistics.median(xs):,.0f}" if xs else "–"


def build() -> str:
    d1, d2, d3 = _load(D1_DIR), _load(D2_DIR), _load(D3_DIR)
    by_cell: dict[str, list[dict]] = defaultdict(list)
    for r in d1:
        by_cell[f"{r['category']}/{r['seed_lang']}"].append(r)
    probes: dict[str, Counter] = defaultdict(Counter)
    if PROBED_LOG.exists():
        for line in PROBED_LOG.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                probes[row.get("cell", "?")][row["status"].split(":")[0]] += 1

    usable = [r for r in d1 if r["caption"].get("status") == "ok"]
    L: list[str] = []
    L.append("# Data card: Retent AI datasets\n")
    L.append(f"Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC by `python -m retent_ml.datacard` from `data/raw/` on this "
             "machine. Every number below is computed; run `hub pull` first to describe the whole team's data.\n")
    L.append("## Sources\n")
    L.append("| Set | What | Source |\n|---|---|---|")
    L.append("| D1 | 5–15 min public videos with YouTube's \"Most replayed\" curve, captions (or Groq Whisper "
             "transcripts) and chapters | yt-dlp on public watch pages |")
    L.append("| D2 | Public YouTube Studio retention screenshots, digitized; each keeps its source URL | "
             "Creators' public posts, digitized with `retent_ml.digitize` |")
    L.append("| D3 | Sponsor, self-promo and reminder segments for D1 videos | SponsorBlock public API |\n")

    L.append("## D1: public interest curves\n")
    L.append(f"Filters: duration {MIN_S // 60}–{MAX_S // 60} min, uploaded at least {MIN_AGE_DAYS} days before collection, "
             "\"Most replayed\" present (≥ 50 points).\n")
    L.append(f"**{len(d1)} videos kept, {len(usable)} with usable text** (target ≈ {TARGET_PER_CELL} per cell, "
             f"{TARGET_PER_CELL * 6} total).\n")
    L.append("| Cell | Kept | Usable text | Channels | Median length | Median views | Caption sources |")
    L.append("|---|---|---|---|---|---|---|")
    for cell in CELLS:
        rs = by_cell.get(cell, [])
        ok = [r for r in rs if r["caption"].get("status") == "ok"]
        src = Counter(f"{r['caption'].get('kind') or 'none'}:{r['caption'].get('lang') or '?'}" for r in ok)
        L.append(f"| {cell} | {len(rs)} | {len(ok)} | {len({r['channel_id'] for r in rs})} | "
                 f"{_med([r['duration'] / 60 for r in rs]) if rs else '–'} min | {_med([r.get('views') or 0 for r in rs])} | "
                 f"{', '.join(f'{k} {v}' for k, v in src.most_common()) or '–'} |")
    pending = Counter(r["caption"].get("status") for r in d1 if r["caption"].get("status") != "ok")
    if pending:
        L.append(f"\nWaiting for text: {', '.join(f'{v} {k}' for k, v in pending.items())} "
                 "(`pending` = caption download rate-limited, pass B; `none`/`empty` = pass C, Groq Whisper).")

    L.append("\n### Yield (from the probe log)\n")
    L.append("YouTube serves \"Most replayed\" only for some videos, so the collector probes more than it keeps.\n")
    L.append("| Cell | Probed | Kept | No curve | Too recent | Wrong length | Errors |")
    L.append("|---|---|---|---|---|---|---|")
    for cell in CELLS:
        c = probes.get(cell, Counter())
        kept = sum(v for k, v in c.items() if k.startswith("kept"))
        total = sum(c.values())
        if total:
            L.append(f"| {cell} | {total} | {kept} ({kept / total:.0%}) | {c['no_heatmap']} | {c['too_recent']} | "
                     f"{c['duration']} | {c['error'] + c['rate_limited']} |")

    L.append("\n### Biases and caveats\n")
    chan = Counter(r["channel"] for r in d1)
    if d1:
        top, n = chan.most_common(1)[0]
        top5 = sum(v for _, v in chan.most_common(5)) / len(d1)
        L.append(f"- **Channel concentration:** the top channel ({top}) supplies {n / len(d1):.0%} of D1; the top five supply "
                 f"{top5:.0%}. Training and evaluation split by channel (GroupKFold), never by video.")
        tiers = Counter(r.get("seed_tier") for r in d1)
        L.append(f"- **Channel size:** {tiers.get('anchor', 0)} videos from named big creators, {tiers.get('topic', 0)} from "
                 "channels found by topic search (mostly mid-sized). Big channels already retain well, so the mix matters.")
        subs = [r["channel_followers"] for r in d1 if r.get("channel_followers")]
        if subs:
            L.append(f"- **Audience size:** median channel has {_med(subs)} subscribers.")
        mismatch = [r for r in usable if r["seed_lang"] == "hi" and r["caption"].get("lang") == "en"]
        if mismatch:
            L.append(f"- **Language mismatch:** {len(mismatch)} videos from Hindi channels have only English captions "
                     "(usually creator-uploaded translations). Their text features describe a translation, not the speech.")
    L.append("- **Survivorship:** only videos YouTube shows a \"Most replayed\" curve for are kept; these skew to older, "
             "more-watched uploads.")
    L.append("- **What the label means:** \"Most replayed\" is *relative* interest within a video (it includes rewatches), "
             "not the share of viewers remaining. It trains the curve's shape; D2 sets the absolute level.")
    L.append("- **Timing:** caption and Whisper timestamps are measured; scripts pasted by users are timed by estimated "
             "speaking rate.\n")

    L.append("## D2: absolute retention (digitized Studio screenshots)\n")
    reviewed = [r for r in d2 if r.get("reviewed")]
    L.append(f"{len(d2)} curves digitized, {len(reviewed)} reviewed against their overlay. "
             "Each keeps its `source_url`; unreviewed curves are not used for fitting.\n")

    L.append("## D3: SponsorBlock segments\n")
    with_segs = [r for r in d3 if r["segments"]]
    cats = Counter(s["category"] for r in d3 for s in r["segments"])
    L.append(f"{len(d3)} D1 videos looked up; {len(with_segs)} have at least one segment"
             + (f" ({', '.join(f'{k} {v}' for k, v in cats.most_common())})." if cats else "."))
    L.append("SponsorBlock is crowd-labelled and skews to English channels with large audiences.\n")

    L.append("## Use and licensing\n")
    L.append("Public metadata, captions and derived features, used for research. Videos and audio are never redistributed; "
             "media downloaded for video-mode features stays on the machine that collected it. Shared through a private "
             "Hugging Face dataset repo (`retent_ml.hub`).")
    return "\n".join(L) + "\n"


def main() -> None:
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
