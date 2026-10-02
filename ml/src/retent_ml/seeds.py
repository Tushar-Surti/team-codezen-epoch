"""Discover seed channels per (category, language) cell from YouTube search.

Named anchor channels (big creators) are resolved by searching for them; many more mid-sized
channels come from topic queries, so the dataset also contains weaker retention, not just the best
in the category. Output: ml/seeds/channels.json (consumed by retent_ml.collect).

Run: uv run --package retent-ml python -m retent_ml.seeds
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import yt_dlp

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "ml" / "seeds" / "channels.json"

MIN_S, MAX_S = 300, 900

ANCHORS: dict[tuple[str, str], list[str]] = {
    ("tech", "en"): ["Marques Brownlee", "Mrwhosetheboss", "Dave2D", "JerryRigEverything", "Austin Evans",
                     "Unbox Therapy", "ShortCircuit"],
    ("tech", "hi"): ["Technical Guruji", "Trakin Tech", "Tech Burner", "Technology Gyan", "Geekyranjit",
                     "Technical Dost"],
    ("education", "en"): ["Kurzgesagt", "CrashCourse", "Veritasium", "Johnny Harris", "Ali Abdaal",
                          "Science ABC", "Arvin Ash"],
    ("education", "hi"): ["Dhruv Rathee", "StudyIQ IAS", "Mohak Mangal", "Think School", "Nitish Rajput",
                          "Khan GS Research Centre"],
    ("vlog", "en"): ["Casey Neistat", "Yes Theory", "Kara and Nate", "Drew Binsky", "Lost LeBlanc"],
    ("vlog", "hi"): ["Sourav Joshi Vlogs", "Flying Beast", "Mumbiker Nikhil", "RS 1313 VLOGS",
                     "Village Cooking Channel"],
}

TOPICS: dict[tuple[str, str], list[str]] = {
    ("tech", "en"): ["phone review", "laptop review", "earbuds review", "camera comparison", "smartwatch review"],
    ("tech", "hi"): ["phone review hindi", "best phone under 20000", "laptop review hindi", "unboxing hindi",
                     "camera comparison hindi"],
    ("education", "en"): ["how it works explained", "history explained", "science explained", "economics explained",
                          "physics concept explained"],
    ("education", "hi"): ["explained in hindi", "science hindi explanation", "history hindi", "economy explained hindi",
                          "current affairs analysis hindi"],
    ("vlog", "en"): ["travel vlog", "day in my life vlog", "road trip vlog", "city vlog", "family vlog"],
    ("vlog", "hi"): ["vlog hindi", "travel vlog hindi", "family vlog hindi", "village vlog", "road trip vlog hindi"],
}


def _search(query: str, n: int) -> list[dict]:
    with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True, "extract_flat": "in_playlist"}) as ydl:
        res = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
    return [e for e in (res.get("entries") or []) if e]


def main() -> None:
    seeds: dict[str, dict] = {}
    for cell in TOPICS:
        cat, lang = cell
        counts: dict[str, int] = defaultdict(int)
        meta: dict[str, dict] = {}
        for name in ANCHORS[cell]:
            for e in _search(name, 5):
                if (e.get("channel") or "").lower() == name.lower() and e.get("channel_id"):
                    seeds[e["channel_id"]] = {
                        "channel": e["channel"], "url": e["channel_url"], "category": cat, "lang": lang,
                        "tier": "anchor",
                    }
                    break
        for q in TOPICS[cell]:
            for e in _search(q, 60):
                if e.get("channel_id") and e.get("duration") and MIN_S <= e["duration"] <= MAX_S:
                    counts[e["channel_id"]] += 1
                    meta[e["channel_id"]] = e
        for cid, c in sorted(counts.items(), key=lambda kv: -kv[1])[:25]:
            if cid not in seeds:
                e = meta[cid]
                seeds[cid] = {"channel": e.get("channel"), "url": e["channel_url"], "category": cat, "lang": lang,
                              "tier": "topic"}
        print(f"{cat}/{lang}: {sum(1 for s in seeds.values() if (s['category'], s['lang']) == cell)} channels",
              flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(list(seeds.values()), indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {len(seeds)} seeds → {OUT}")


if __name__ == "__main__":
    main()
