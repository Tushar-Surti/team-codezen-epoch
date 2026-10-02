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


def _keys() -> list[str]:
    """GROQ_API_KEYS (comma-separated, one per account) and/or GROQ_API_KEY. Limits are per account."""
    keys = [k.strip() for k in os.environ.get("GROQ_API_KEYS", "").split(",") if k.strip()]
    single = os.environ.get("GROQ_API_KEY", "").strip()
    if single and single not in keys:
        keys.append(single)
    return keys


def available() -> bool:
    return bool(_keys())


# (key, model) pairs whose daily quota is spent, with the time they can be tried again.
# Groq limits are per account *and* per model, so a spent model doesn't block the others.
_exhausted: dict[tuple[str, str], float] = {}


def _post(path: str, *, retries: int = 4, timeout: float = 180.0, **kwargs) -> dict:
    """POST with key rotation and short backoff on 429 / 5xx.

    A per-minute limit waits briefly and retries. A daily limit (or a wait longer than 30 s) marks
    that key spent and moves to the next key at once, instead of stalling the request for minutes."""
    keys = _keys()
    if not keys:
        raise GroqError("GROQ_API_KEY is not set")
    model = str((kwargs.get("json") or kwargs.get("data") or {}).get("model", ""))
    last = "no usable key"
    for key in sorted(keys, key=lambda k: _exhausted.get((k, model), 0.0)):
        if _exhausted.get((key, model), 0.0) > time.time():
            last = f"all Groq keys have hit their daily limit for {model}"
            continue
        for attempt in range(retries):
            try:
                res = httpx.post(f"{BASE}{path}", headers={"Authorization": f"Bearer {key}"}, timeout=timeout, **kwargs)
            except httpx.TransportError as exc:
                last = f"network error: {exc}"
                time.sleep(2 ** attempt)
                continue
            if res.status_code == 429 or res.status_code >= 500:
                wait = float(res.headers.get("retry-after") or 0) or min(20.0, 3 * 2 ** attempt)
                daily = "per day" in res.text or "(TPD)" in res.text or "(RPD)" in res.text
                last = f"{res.status_code}: {res.text[:200]}"
                if res.status_code == 429 and (daily or wait > 30):
                    _exhausted[(key, model)] = time.time() + max(wait, 60.0)
                    break  # next key
                time.sleep(wait)
                continue
            if res.status_code >= 400:
                raise GroqError(f"{res.status_code}: {res.text[:300]}")
            return res.json()
    raise GroqError(last)


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
              temperature: float = 0.2, max_tokens: int = 4096, **extra) -> dict:
    """Chat completion that must return a JSON object (schema-constrained when `schema` is given)."""
    payload: dict = {
        "model": model or os.environ.get("RETENT_GROQ_FAST_MODEL", "openai/gpt-oss-120b"),
        "messages": messages, "temperature": temperature, "max_completion_tokens": max_tokens, **extra,
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
