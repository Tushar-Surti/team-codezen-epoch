"""LLM router: Claude (deep) and Groq (fast) behind one JSON interface.

Every call returns `(data, Provenance)` so the UI can badge who wrote what. Calls are cached on
disk by (provider, model, prompt version, payload) so re-runs, demos and tests are free and stable.
If the preferred provider is missing or fails, the router falls back to the other one.

The LLMs never produce the retention curve. They read the script (semantic labels) and write fix
text; the engine does the predicting.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Literal

from retent_core import groq
from retent_core.contract import Engine, Provenance, Provider

CACHE = Path(__file__).resolve().parents[4] / "data" / "cache" / "llm"
Role = Literal["read", "write"]


class LLMError(RuntimeError):
    pass


def claude_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def claude_model() -> str:
    return os.environ.get("RETENT_CLAUDE_MODEL", "claude-opus-5-5")


def groq_model() -> str:
    return os.environ.get("RETENT_GROQ_FAST_MODEL", "openai/gpt-oss-120b")


def groq_fallbacks() -> list[str]:
    """Each Groq model has its own daily token quota, so a spent model falls through to the next."""
    extra = os.environ.get("RETENT_GROQ_FALLBACK_MODELS", "openai/gpt-oss-20b,llama-3.3-70b-versatile")
    return [groq_model()] + [m.strip() for m in extra.split(",") if m.strip() and m.strip() != groq_model()]


def _claude_json(system: str, user: str, schema: dict, effort: str) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=claude_model(),
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        # The system prompt is stable across calls, so it is cached.
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
    )
    if response.stop_reason == "refusal":
        raise LLMError("Claude declined this request")
    if response.stop_reason == "max_tokens":
        raise LLMError("Claude ran out of output tokens")
    text = next((b.text for b in response.content if b.type == "text"), "")
    return json.loads(text)


def _groq_json(system: str, user: str, schema: dict, effort: str, model: str) -> dict:
    extra = {"reasoning_effort": {"low": "low", "medium": "medium", "high": "high"}.get(effort, "medium")} \
        if model.startswith("openai/gpt-oss") else {}
    return groq.chat_json(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        model=model, schema=schema, temperature=0.2, max_tokens=8000, **extra,
    )


def _order(role: Role, engine: Engine | str) -> list[Provider]:
    engine = Engine(engine)
    if engine == Engine.deep:
        prefs = [Provider.claude, Provider.groq]
    elif engine == Engine.fast:
        prefs = [Provider.groq, Provider.claude]
    else:  # auto: Groq reads fast, Claude writes well
        prefs = [Provider.groq, Provider.claude] if role == "read" else [Provider.claude, Provider.groq]
    available = {Provider.claude: claude_available(), Provider.groq: groq.available()}
    return [p for p in prefs if available[p]]


def complete_json(*, role: Role, engine: Engine | str, system: str, user: str, schema: dict,
                  prompt_version: str, effort: str = "medium", use_cache: bool = True) -> tuple[dict, Provenance]:
    providers = _order(role, engine)
    if not providers:
        raise LLMError("No LLM provider configured: set GROQ_API_KEY or ANTHROPIC_API_KEY in .env")
    errors = []
    attempts = [(p, m) for p in providers for m in ([claude_model()] if p == Provider.claude else groq_fallbacks())]
    for provider, model in attempts:
        key = hashlib.sha256(json.dumps([provider, model, prompt_version, system, user, schema, effort],
                                        sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:32]
        path = CACHE / f"{key}.json"
        prov = Provenance(provider=provider, model=model, prompt_version=prompt_version)
        if use_cache and path.exists():
            return json.loads(path.read_text(encoding="utf-8")), prov
        try:
            data = (_claude_json(system, user, schema, effort) if provider == Provider.claude
                    else _groq_json(system, user, schema, effort, model))
        except Exception as exc:  # noqa: BLE001 - fall through to the next model / provider
            errors.append(f"{provider}/{model}: {str(exc)[:160]}")
            continue
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data, prov
    raise LLMError("; ".join(errors))
