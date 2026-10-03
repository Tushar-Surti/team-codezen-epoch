"""Public YouTube video → metadata, "Most replayed" curve, chapters and a timed transcript.

Captions come from YouTube when it allows (creator captions, then the original-language ASR track).
When captions are blocked (HTTP 429) or missing, the audio is downloaded to a temporary folder,
transcribed with Groq Whisper and deleted. No YouTube API key is needed (yt-dlp, public pages).
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

from retent_core import groq
from retent_ml.asr import download_audio
from retent_ml.collect import CAPTION_LANGS, RateLimited, _fetch_json3, _pick_caption, _ydl, spoken_language

ID_RE = re.compile(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})")
MAX_SECONDS = 25 * 60  # Whisper quota guard; the product is tuned for 5–15 minutes


class YouTubeError(RuntimeError):
    pass


def video_id(url: str) -> str:
    url = url.strip()
    if m := ID_RE.search(url):
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
        return url
    raise YouTubeError("That doesn't look like a YouTube video link. Paste a link like https://youtu.be/VIDEO_ID.")


def fetch_info(vid: str) -> dict:
    try:
        with _ydl() as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    except Exception as exc:  # noqa: BLE001 - surface a readable message
        msg = str(exc)
        if "confirm you" in msg.lower() or "bot" in msg.lower():
            raise YouTubeError("YouTube is asking this connection to confirm it isn't a bot. Try again in a few "
                               "minutes, or use the Blind Test list.") from exc
        raise YouTubeError(f"Couldn't open that video: {msg[:160]}") from exc
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
        raise YouTubeError("That's a live stream. Paste a finished video.")
    duration = float(info.get("duration") or 0)
    if not duration:
        raise YouTubeError("YouTube didn't report a length for that video.")
    if duration > MAX_SECONDS:
        raise YouTubeError(f"That video runs {duration / 60:.0f} minutes. Retent AI analyses videos up to 25 minutes "
                           "(it's tuned for 5–15).")
    return info


def transcript(info: dict, on_whisper=None, allow_whisper: bool = True) -> tuple[list[dict], str, str | None]:
    """Returns (segments, source, language). Source is "manual", "auto" or "asr"."""
    vid = info["id"]
    lang = spoken_language(info)
    candidates = ([lang] if lang in CAPTION_LANGS else []) + [c for c in CAPTION_LANGS if c != lang]
    for cand in candidates:
        picked = _pick_caption(info, cand)
        if not picked:
            continue
        try:
            segs = _fetch_json3(vid, *picked)
        except RateLimited:
            break  # captions blocked on this connection: fall through to Whisper
        except Exception:  # noqa: BLE001
            continue
        if len(segs) >= 20:
            return segs, picked[0], cand
    if not allow_whisper:
        raise YouTubeError("No captions available and transcription is switched off for this request.")
    if not groq.available():
        raise YouTubeError("YouTube is blocking captions on this connection and no GROQ_API_KEY is set for Whisper.")
    if on_whisper:
        on_whisper()
    with tempfile.TemporaryDirectory() as tmp:
        try:
            audio = download_audio(vid, Path(tmp))
        except Exception as exc:  # noqa: BLE001
            raise YouTubeError(f"Couldn't download the audio to transcribe it: {str(exc)[:140]}") from exc
        if audio.stat().st_size > 24e6:
            raise YouTubeError("The audio is too large to transcribe in one go. Try a shorter video.")
        segs = groq.transcribe(audio, lang if lang in CAPTION_LANGS else None)
    if len(segs) < 20:
        raise YouTubeError("Couldn't get enough speech from this video to analyze it.")
    return segs, "asr", lang if lang in CAPTION_LANGS else None
