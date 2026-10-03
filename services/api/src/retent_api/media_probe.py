"""Rough-cut analysis with ffmpeg: duration, small mono audio for Whisper, shot cuts and silences.

Everything runs locally. Scene detection runs on a downscaled 5 fps stream, so a 15-minute 1080p
cut takes seconds, not minutes.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

SCENE_THRESHOLD = 0.32
SILENCE_DB = -38
SILENCE_MIN_S = 2.0


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"{cmd[0]} isn't installed on the machine running the API. Install ffmpeg "
            "(brew install ffmpeg, or winget install ffmpeg on Windows), then restart the API."
        ) from exc


def duration(path: Path) -> float:
    out = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)])
    try:
        return float(json.loads(out.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("That file doesn't look like a video or audio file ffmpeg can read.") from exc


def has_video(path: Path) -> bool:
    out = _run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type",
                "-of", "csv=p=0", str(path)])
    return "video" in out.stdout


def extract_audio(path: Path, out: Path) -> Path:
    """Mono 16 kHz, 48 kbps MP3: about 5.5 MB for 15 minutes, well under Groq's upload limit."""
    proc = _run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path), "-vn", "-ac", "1",
                 "-ar", "16000", "-b:a", "48k", str(out)])
    if proc.returncode != 0 or not out.exists():
        raise ValueError(f"Couldn't extract the audio: {proc.stderr[-200:]}")
    return out


def scene_cuts(path: Path) -> list[float]:
    proc = _run(["ffmpeg", "-hide_banner", "-hwaccel", "videotoolbox", "-i", str(path), "-an",
                 "-vf", f"fps=5,scale=320:-2,select='gt(scene,{SCENE_THRESHOLD})',showinfo", "-f", "null", "-"])
    if proc.returncode != 0:  # hardware decode unavailable for this codec: software path
        proc = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-an",
                     "-vf", f"fps=5,scale=320:-2,select='gt(scene,{SCENE_THRESHOLD})',showinfo", "-f", "null", "-"])
    return [round(float(t), 2) for t in re.findall(r"pts_time:([0-9.]+)", proc.stderr)]


def silences(audio: Path) -> list[list[float]]:
    proc = _run(["ffmpeg", "-hide_banner", "-i", str(audio), "-af",
                 f"silencedetect=noise={SILENCE_DB}dB:d={SILENCE_MIN_S}", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start: (-?[0-9.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", proc.stderr)]
    return [[round(max(0.0, s), 2), round(e, 2)] for s, e in zip(starts, ends)]
