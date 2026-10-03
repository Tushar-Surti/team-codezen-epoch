"""D1-media: low-bitrate audio and 144p video for a balanced subset of D1 (video-mode features, A3).

Picks videos round-robin across the (category, language) cells so every cell is represented, and
downloads two streams per video into data/media/<video_id>/: audio (~50 kbps) and video-only at
144p. No ffmpeg needed: the streams are kept separate. About 10–15 MB per 10-minute video.
Media files are never redistributed; they stay on the machine that collected them.

Run: uv run --package retent-ml python -m retent_ml.media --limit 300
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

from retent_ml.asr import AUDIO_CLIENTS, AUDIO_FORMAT
from retent_ml.collect import OUT_DIR as D1_DIR, ROOT, _ydl

MEDIA_DIR = ROOT / "data" / "media"
VIDEO_FORMAT = "bestvideo[height<=144]/worstvideo"


def _download(video_id: str, folder: Path, fmt: str, name: str) -> Path | None:
    opts = {"skip_download": False, "format": fmt, "paths": {"home": str(folder)},
            "outtmpl": {"default": f"{name}.%(ext)s"},
            "extractor_args": {"youtube": {"player_client": AUDIO_CLIENTS}}}
    with _ydl(**opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
    files = [p for p in folder.glob(f"{name}.*") if p.suffix not in (".part", ".ytdl")]
    return files[0] if files else None


def balanced_ids(limit: int) -> list[str]:
    cells: dict[str, list[str]] = defaultdict(list)
    for p in sorted(D1_DIR.glob("*.json")):
        rec = json.loads(p.read_text(encoding="utf-8"))
        if rec["caption"].get("status") == "ok":
            cells[f"{rec['category']}/{rec['seed_lang']}"].append(rec["id"])
    out: list[str] = []
    while len(out) < limit and any(cells.values()):
        for cell in sorted(cells):
            if cells[cell] and len(out) < limit:
                out.append(cells[cell].pop(0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--sleep", type=float, default=2.0)
    ap.add_argument("--audio-only", action="store_true")
    args = ap.parse_args()
    ids = balanced_ids(args.limit)
    print(f"{len(ids)} videos selected", flush=True)
    for vid in ids:
        folder = MEDIA_DIR / vid
        if (folder / "done.json").exists():
            continue
        folder.mkdir(parents=True, exist_ok=True)
        try:
            audio = _download(vid, folder, AUDIO_FORMAT, "audio")
            video = None if args.audio_only else _download(vid, folder, VIDEO_FORMAT, "video")
        except Exception as exc:  # noqa: BLE001 - keep going
            print(f"{vid} error {str(exc)[:120]}", flush=True)
            time.sleep(5)
            continue
        info = {"id": vid, "audio": audio.name if audio else None, "video": video.name if video else None,
                "bytes": sum(p.stat().st_size for p in folder.iterdir())}
        (folder / "done.json").write_text(json.dumps(info), encoding="utf-8")
        print(f"{vid} audio={info['audio']} video={info['video']} {info['bytes'] / 1e6:.1f} MB", flush=True)
        time.sleep(args.sleep)


if __name__ == "__main__":
    main()
