"""Groq client: Whisper transcription and JSON-mode chat, with rate-limit backoff.

Shared by the offline pipeline (captions fallback, labeling) and the API (URL and video modes).
Reads GROQ_API_KEY and the RETENT_GROQ_* model names from the environment.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

BASE = "https://api.groq.com/openai/v1"


class GroqError(RuntimeError):
    pass


def available() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def _headers() -> dict:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise GroqError("GROQ_API_KEY is not set")
    return {"Authorization": f"Bearer {key}"}


def _post(path: str, *, retries: int = 5, timeout: float = 180.0, **kwargs) -> dict:
    """POST with backoff on 429 / 5xx. Honors Retry-After when Groq sends it."""
    for attempt in range(retries):
        try:
            res = httpx.post(f"{BASE}{path}", headers=_headers(), timeout=timeout, **kwargs)
        except httpx.TransportError as exc:
            if attempt == retries - 1:
                raise GroqError(f"network error: {exc}") from exc
            time.sleep(2 ** attempt)
            continue
        if res.status_code == 429 or res.status_code >= 500:
            if attempt == retries - 1:
                raise GroqError(f"{res.status_code}: {res.text[:300]}")
            wait = float(res.headers.get("retry-after") or 0) or min(120.0, 5 * 2 ** attempt)
            time.sleep(wait)
            continue
        if res.status_code >= 400:
            raise GroqError(f"{res.status_code}: {res.text[:300]}")
        return res.json()
    raise GroqError("unreachable")


def asr_model() -> str:
    return os.environ.get("RETENT_GROQ_ASR_MODEL", "whisper-large-v3")


def transcribe(audio: Path, language: str | None = None, model: str | None = None) -> list[dict]:
    """Whisper on Groq → caption-style segments [{start, end, text}] in seconds."""
    data = {"model": model or asr_model(), "response_format": "verbose_json", "temperature": "0"}
    if language:
        data["language"] = language
    with audio.open("rb") as f:
        body = _post("/audio/transcriptions", data=data, files={"file": (audio.name, f)})
    return [{"start": float(s["start"]), "end": float(s["end"]), "text": s["text"].strip()}
            for s in body.get("segments") or [] if s.get("text", "").strip()]


def chat_json(messages: list[dict], *, model: str | None = None, schema: dict | None = None,
              temperature: float = 0.2, max_tokens: int = 4096) -> dict:
    """Chat completion that must return a JSON object (schema-constrained when `schema` is given)."""
    payload: dict = {
        "model": model or os.environ.get("RETENT_GROQ_FAST_MODEL", "openai/gpt-oss-120b"),
        "messages": messages, "temperature": temperature, "max_completion_tokens": max_tokens,
    }
    if schema:
        payload["response_format"] = {"type": "json_schema", "json_schema": {"name": "out", "schema": schema}}
    else:
        payload["response_format"] = {"type": "json_object"}
    body = _post("/chat/completions", json=payload)
    content = body["choices"][0]["message"].get("content") or ""
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise GroqError(f"model returned invalid JSON: {content[:200]}") from exc
