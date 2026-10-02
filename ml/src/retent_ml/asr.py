"""Pass C: Groq Whisper transcripts for D1 records without usable captions.

YouTube rate-limits caption downloads per IP (HTTP 429) and some videos have no caption track at
all. This pass downloads the smallest audio-only stream (no ffmpeg needed; about 5 MB for 15 min)
and transcribes it with Groq Whisper, keeping segment timestamps. The record's caption block is
replaced with `kind: "asr"` so training can tell ASR text from caption text.

Groq's free tier allows about 2 hours of audio per hour and 8 per day, so `--max-minutes` caps a run.

Run:
  uv run --package retent-ml python -m retent_ml.asr                  # missing/empty captions
  uv run --package retent-ml python -m retent_ml.asr --include-pending  # also 429-blocked ones
"""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

from retent_core import groq
from retent_ml.collect import OUT_DIR, ROOT, _ydl

# Smallest audio that's still clean (~50 kbps Opus / 48 kbps AAC), well under Groq's 25 MB limit.
# "bestaudio" within a bitrate cap keeps yt-dlp's language ordering, so the original track wins
# over auto-dubbed ones.
AUDIO_FORMAT = "bestaudio[abr<=80]/bestaudio[abr<=140]/bestaudio"
# The default web client often gets only images without a PO token; the embedded player still
# lists audio formats for embeddable videos.
AUDIO_CLIENTS = ["web_embedded", "mweb", "default"]


def download_audio(video_id: str, folder: Path) -> Path:
    opts = {"skip_download": False, "format": AUDIO_FORMAT, "paths": {"home": str(folder)},
            "outtmpl": {"default": "%(id)s.%(ext)s"},
            "extractor_args": {"youtube": {"player_client": AUDIO_CLIENTS}}}
    with _ydl(**opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
    files = [p for p in folder.iterdir() if p.stem == video_id and p.suffix not in (".part", ".ytdl")]
    if not files:
        raise RuntimeError("no audio downloaded")
    return files[0]


def _language(rec: dict) -> str | None:
    lang = rec["caption"].get("lang") or (rec.get("language") or "").split("-")[0] or rec.get("seed_lang")
    return lang if lang in ("en", "hi") else None


def needs_asr(rec: dict, include_pending: bool) -> bool:
    status = rec["caption"].get("status")
    return status in ("none", "empty") or (include_pending and status == "pending")


def main() -> None:
    load_dotenv(ROOT / ".env")
    ap = argparse.ArgumentParser()
    ap.add_argument("--include-pending", action="store_true", help="Also transcribe 429-blocked captions.")
    ap.add_argument("--max-minutes", type=float, default=110.0, help="Audio budget for this run.")
    ap.add_argument("--model", default=None, help="Groq ASR model (default RETENT_GROQ_ASR_MODEL).")
    args = ap.parse_args()
    if not groq.available():
        raise SystemExit("GROQ_API_KEY is not set in .env")

    files = sorted(OUT_DIR.glob("*.json"))
    todo = []
    for f in files:
        rec = json.loads(f.read_text(encoding="utf-8"))
        if needs_asr(rec, args.include_pending):
            todo.append((0 if rec["caption"].get("status") != "pending" else 1, rec["duration"], f))
    todo.sort()
    print(f"{len(todo)} records need ASR", flush=True)

    used = 0.0
    model = args.model or groq.asr_model()
    for _, duration, f in todo:
        if used + duration / 60 > args.max_minutes:
            print(f"audio budget reached ({used:.0f} min); rerun later to continue", flush=True)
            break
        rec = json.loads(f.read_text(encoding="utf-8"))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                audio = download_audio(rec["id"], Path(tmp))
                size_mb = audio.stat().st_size / 1e6
                if size_mb > 24:
                    print(f"{rec['id']} audio {size_mb:.0f} MB is over the upload limit; skipped", flush=True)
                    continue
                segs = groq.transcribe(audio, _language(rec), model)
        except Exception as exc:  # noqa: BLE001 - keep going through the queue
            print(f"{rec['id']} error {str(exc)[:120]}", flush=True)
            time.sleep(3)
            continue
        used += duration / 60
        previous = {k: rec["caption"].get(k) for k in ("kind", "key", "status")}
        rec["caption"] = {"lang": _language(rec), "kind": "asr", "key": f"groq:{model}",
                          "status": "ok" if len(segs) >= 20 else "empty", "segments": segs,
                          "replaced": previous, "transcribed_at": datetime.now(UTC).isoformat()}
        f.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
        print(f"{rec['id']} asr {rec['caption']['status']} ({len(segs)} segments, {duration / 60:.1f} min)", flush=True)
    print(f"done; {used:.0f} min of audio transcribed", flush=True)


if __name__ == "__main__":
    main()
