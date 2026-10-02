"""Phase 0 data spike: can we get "Most replayed", captions (EN + HI) and chapters?

Run: uv run --package retent-ml python -m retent_ml.spike
"""

from __future__ import annotations

import json
import sys

import yt_dlp

QUERIES = {
    ("tech", "en"): "smartphone review 2026",
    ("tech", "hi"): "phone review hindi 2026",
    ("education", "en"): "explained science video",
    ("education", "hi"): "explained in hindi",
    ("vlog", "en"): "travel vlog day in",
    ("vlog", "hi"): "vlog hindi family trip",
}
PER_QUERY = 4
MIN_S, MAX_S = 300, 900


def _flat_search(query: str, n: int) -> list[dict]:
    opts = {"quiet": True, "skip_download": True, "extract_flat": "in_playlist"}
    with yt_dlp.YoutubeDL(opts) as ydl:
        res = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
    return [e for e in res.get("entries", []) if e]


def _probe(video_id: str) -> dict:
    opts = {"quiet": True, "skip_download": True, "no_warnings": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    heat = info.get("heatmap") or []
    return {
        "id": video_id,
        "title": info.get("title"),
        "channel": info.get("channel"),
        "duration": info.get("duration"),
        "views": info.get("view_count"),
        "heatmap_points": len(heat),
        "heatmap_sample": heat[:2],
        "manual_subs": sorted((info.get("subtitles") or {}).keys())[:8],
        "auto_has_en": "en" in (info.get("automatic_captions") or {}),
        "auto_has_hi": "hi" in (info.get("automatic_captions") or {}),
        "chapters": len(info.get("chapters") or []),
        "language": info.get("language"),
    }


def main() -> None:
    rows = []
    for (cat, lang), q in QUERIES.items():
        hits = [
            e for e in _flat_search(q, 15)
            if e.get("duration") and MIN_S <= e["duration"] <= MAX_S
        ][:PER_QUERY]
        for e in hits:
            try:
                row = _probe(e["id"])
            except Exception as exc:  # noqa: BLE001 - spike: report and continue
                row = {"id": e["id"], "error": str(exc)[:200]}
            row.update(category=cat, lang=lang)
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)

    ok = [r for r in rows if "error" not in r]
    with_heat = [r for r in ok if r["heatmap_points"] > 0]
    print("\nSUMMARY", file=sys.stderr)
    print(f"probed={len(rows)} ok={len(ok)} heatmap={len(with_heat)}", file=sys.stderr)
    print(f"auto_hi={sum(r['auto_has_hi'] for r in ok)} chapters>0={sum(r['chapters'] > 0 for r in ok)}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
