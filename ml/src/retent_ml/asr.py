"""Pass C: Groq Whisper transcripts for D1 records without usable captions.

YouTube rate-limits caption downloads per IP (HTTP 429) and some videos have no caption track at
all. This pass downloads the smallest audio-only stream (no ffmpeg needed; about 5 MB for 15 min)
and transcribes it with Groq Whisper, keeping segment timestamps. The record's caption block is
replaced with `kind: "asr"` so training can tell ASR text from caption text.

Groq's free tier allows about 2 hours of audio per hour and 8 per day, so `--max-minutes` caps a run.
On a machine with an NVIDIA GPU, `--engine local` runs faster-whisper instead, with no quota.

Run:
  uv run --package retent-ml python -m retent_ml.asr                  # missing/empty captions
  uv run --package retent-ml python -m retent_ml.asr --include-pending  # also 429-blocked ones
  uv run --package retent-ml python -m retent_ml.asr --engine local     # local GPU (gpu extra)
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


class LocalWhisper:
    """faster-whisper on the local GPU (float16; int8 has cuBLAS failures on RTX 50-series).

    CTranslate2 needs the cuBLAS and cuDNN DLLs; the CUDA torch wheel ships them, so on Windows
    their folder is added to the DLL search path instead of requiring a CUDA toolkit install."""

    def __init__(self, model: str = "large-v3-turbo"):
        import os
        import sys

        if sys.platform == "win32":
            try:
                import torch

                os.add_dll_directory(str(Path(torch.__file__).parent / "lib"))
            except ImportError:
                pass
        from faster_whisper import WhisperModel

        self.name = model
        self.model = WhisperModel(model, device="cuda", compute_type="float16")

    def transcribe(self, audio: Path, language: str | None) -> list[dict]:
        segments, _ = self.model.transcribe(str(audio), language=language, vad_filter=True, beam_size=5)
        return [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
                for s in segments if s.text.strip()]


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
    ap.add_argument("--engine", choices=["groq", "local"], default="groq",
                    help="groq (API, quota) or local (faster-whisper on this GPU, no quota).")
    ap.add_argument("--model", default=None, help="ASR model (Groq default RETENT_GROQ_ASR_MODEL; local large-v3-turbo).")
    ap.add_argument("--only", help="Only these cells, comma-separated, e.g. tech/hi,vlog/hi (spend quota where data is thin).")
    ap.add_argument("--skip-in", type=Path, help="Skip videos present in this d1 folder (e.g. a kit someone else is transcribing).")
    args = ap.parse_args()
    local = LocalWhisper(args.model or "large-v3-turbo") if args.engine == "local" else None
    if not local and not groq.available():
        raise SystemExit("GROQ_API_KEY is not set in .env (or use --engine local)")
    if local:
        args.max_minutes = float("inf")

    files = sorted(OUT_DIR.glob("*.json"))
    skip = {p.name for p in args.skip_in.glob("*.json")} if args.skip_in else set()
    files = [f for f in files if f.name not in skip]
    todo = []
    for f in files:
        rec = json.loads(f.read_text(encoding="utf-8"))
        cell = f"{rec.get('category')}/{rec.get('seed_lang')}"
        if args.only and cell not in args.only.split(","):
            continue
        if needs_asr(rec, args.include_pending):
            todo.append((0 if rec["caption"].get("status") != "pending" else 1, rec["duration"], f))
    todo.sort()
    print(f"{len(todo)} records need ASR", flush=True)

    used = 0.0
    model = f"local:{local.name}" if local else f"groq:{args.model or groq.asr_model()}"
    for _, duration, f in todo:
        if used + duration / 60 > args.max_minutes:
            print(f"audio budget reached ({used:.0f} min); rerun later to continue", flush=True)
            break
        rec = json.loads(f.read_text(encoding="utf-8"))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                audio = download_audio(rec["id"], Path(tmp))
                size_mb = audio.stat().st_size / 1e6
                if size_mb > 24 and not local:
                    print(f"{rec['id']} audio {size_mb:.0f} MB is over the upload limit; skipped", flush=True)
                    continue
                segs = (local.transcribe(audio, _language(rec)) if local
                        else groq.transcribe(audio, _language(rec), args.model or groq.asr_model()))
        except Exception as exc:  # noqa: BLE001 - keep going through the queue
            print(f"{rec['id']} error {str(exc)[:120]}", flush=True)
            time.sleep(3)
            continue
        used += duration / 60
        previous = {k: rec["caption"].get(k) for k in ("kind", "key", "status")}
        rec["caption"] = {"lang": _language(rec), "kind": "asr", "key": model,
                          "status": "ok" if len(segs) >= 20 else "empty", "segments": segs,
                          "replaced": previous, "transcribed_at": datetime.now(UTC).isoformat()}
        f.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
        print(f"{rec['id']} asr {rec['caption']['status']} ({len(segs)} segments, {duration / 60:.1f} min)", flush=True)
    print(f"done; {used:.0f} min of audio transcribed", flush=True)


if __name__ == "__main__":
    main()
