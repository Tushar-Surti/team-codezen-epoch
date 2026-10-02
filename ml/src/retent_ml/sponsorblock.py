"""D3: SponsorBlock segments for D1 videos (the natural experiment for sponsor and self-promo dips).

SponsorBlock is a public, crowd-labelled database of sponsor reads, self-promotion, subscribe
reminders, intros and outros. One record per D1 video goes to data/raw/d3/<video_id>.json, with an
empty list when the video has no submissions (so it isn't fetched again).

Run: uv run --package retent-ml python -m retent_ml.sponsorblock
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime

import requests

from retent_ml.collect import OUT_DIR as D1_DIR, ROOT

OUT_DIR = ROOT / "data" / "raw" / "d3"
API = "https://sponsor.ajay.app/api/skipSegments"
CATEGORIES = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "filler"]


def fetch(video_id: str, session: requests.Session) -> list[dict]:
    res = session.get(API, params={"videoID": video_id, "categories": json.dumps(CATEGORIES)}, timeout=20)
    if res.status_code == 404:  # no submissions for this video
        return []
    res.raise_for_status()
    return [{"start": float(s["segment"][0]), "end": float(s["segment"][1]), "category": s["category"],
             "action": s.get("actionType"), "votes": s.get("votes"), "uuid": s.get("UUID")}
            for s in res.json()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="Refetch videos already looked up.")
    ap.add_argument("--sleep", type=float, default=0.4)
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = "retent-ai-research (public data; github.com)"
    ids = sorted(p.stem for p in D1_DIR.glob("*.json"))
    found = done = 0
    for vid in ids:
        out = OUT_DIR / f"{vid}.json"
        if out.exists() and not args.refresh:
            continue
        try:
            segs = fetch(vid, session)
        except requests.RequestException as exc:
            print(f"{vid} error {str(exc)[:100]}", flush=True)
            time.sleep(5)
            continue
        out.write_text(json.dumps({"id": vid, "segments": segs, "fetched_at": datetime.now(UTC).isoformat()},
                                  ensure_ascii=False), encoding="utf-8")
        done += 1
        found += bool(segs)
        if segs:
            cats = ", ".join(sorted({s["category"] for s in segs}))
            print(f"{vid} {len(segs)} segments ({cats})", flush=True)
        time.sleep(args.sleep)
    print(f"looked up {done} videos; {found} have segments", flush=True)


if __name__ == "__main__":
    main()
