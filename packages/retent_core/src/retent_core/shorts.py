"""Shorts Finder: pick the 3–4 stretches of a long video that hold attention best, and package each as a Short.

Scoring uses YouTube's real "Most replayed" curve when the video has one, otherwise the model's
predicted interest. Clips are 22–58 s, start and end on sentence boundaries, and avoid asks, sponsor
reads, greetings and wrap-ups (those don't stand alone). An LLM writes each Short's title, on-screen
hook and a description that sends viewers to the full video.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from retent_core.contract import Analysis, Engine, Provenance
from retent_core.llm import LLMError, complete_json
from retent_core.text import CTA_CUES, GREETING_CUES, OUTRO_CUES, SPONSOR_CUES, has_cue

MIN_S, MAX_S = 22.0, 58.0
BAD_ROLES = {"cta", "sponsor", "greeting", "outro"}
CONTINUATION = re.compile(r"^(and|so|but|also|then|aur|toh|to|lekin|फिर|और|तो|लेकिन)\b", re.I)


@dataclass
class Clip:
    start: float
    end: float
    score: float
    sentence_ids: list[str]
    text: str


def _per_second(values: np.ndarray, duration: float) -> np.ndarray:
    secs = np.arange(int(np.ceil(duration)) + 1)
    xs = (np.arange(len(values)) + 0.5) / len(values) * duration
    return np.interp(secs, xs, values)


def find_clips(a: Analysis, heatmap: list[dict] | None = None, n: int = 4) -> tuple[list[Clip], str]:
    dur = a.metrics.duration_seconds
    if heatmap and len(heatmap) >= 50:
        xs = np.array([(h["start_time"] + h["end_time"]) / 2 for h in heatmap])
        ys = np.array([h["value"] for h in heatmap], dtype=float)
        per_sec = np.interp(np.arange(int(np.ceil(dur)) + 1), xs, ys)
        source = "most_replayed"
    else:
        per_sec = _per_second(np.array([b.interest for b in a.curve.bins]), dur)
        source = "model"
    per_sec = (per_sec - per_sec.mean()) / (per_sec.std() + 1e-9)

    sents = a.sentences
    bad = [s.role in BAD_ROLES or has_cue(s.text, CTA_CUES + SPONSOR_CUES + OUTRO_CUES + GREETING_CUES) for s in sents]
    good = [s.role in ("hook", "payoff") for s in sents]
    cands: list[Clip] = []
    for i, s in enumerate(sents):
        # Skip the opening: every video's curve spikes at the start because everyone watches the start.
        if bad[i] or s.start < max(20.0, dur * 0.08):
            continue
        for j in range(i, len(sents)):
            length = sents[j].end - s.start
            if length > MAX_S or bad[j]:
                break
            if length < MIN_S:
                continue
            lo, hi = int(s.start), int(np.ceil(sents[j].end))
            score = float(per_sec[lo:hi + 1].mean())
            score += 0.25 * sum(good[i:j + 1]) / (j - i + 1)
            score -= 0.3 * bool(CONTINUATION.match(s.text.strip()))
            score -= 0.002 * abs(length - 40)  # a gentle pull toward ~40 s, the Shorts sweet spot
            cands.append(Clip(s.start, sents[j].end, score, [x.id for x in sents[i:j + 1]],
                              " ".join(x.text for x in sents[i:j + 1])))
    picked: list[Clip] = []
    for c in sorted(cands, key=lambda c: -c.score):
        if all(c.end + 8 <= p.start or c.start >= p.end + 8 for p in picked):
            picked.append(c)
        if len(picked) == n:
            break
    return sorted(picked, key=lambda c: c.start), source


PACK_SCHEMA = {
    "type": "object",
    "properties": {
        "shorts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "title": {"type": "string"},
                    "hook_text": {"type": "string"},
                    "description": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["index", "title", "hook_text", "description", "why"], "additionalProperties": False,
            },
        },
    },
    "required": ["shorts"], "additionalProperties": False,
}
PACK_SYSTEM = """You package clips from a long YouTube video as YouTube Shorts / Instagram Reels.
For each clip write:
- title: under 60 characters, curiosity-driven, in the video's language, no clickbait lies, no hashtags.
- hook_text: 3-7 words shown on screen in the first seconds. Use Latin letters only (for Hindi videos write
  Hinglish in Latin letters). Make it specific to the clip.
- description: 2 short lines in the video's language; the second line must be exactly "Watch the full video: {FULL_VIDEO}".
- why: one plain sentence on why this moment works as a Short.
Never invent facts that aren't in the clip. Return JSON only."""


def package(a: Analysis, clips: list[Clip], engine: Engine | str = Engine.auto) -> tuple[list[dict], Provenance | None]:
    def fallback(i: int, c: Clip) -> dict:
        words = re.sub(r"[^\w\s']", "", c.text).split()
        return {"index": i, "title": a.meta.title[:57] + ("…" if len(a.meta.title) > 57 else ""),
                "hook_text": " ".join(words[:6]), "description": f"{a.meta.title}\nWatch the full video: {{FULL_VIDEO}}",
                "why": "Highest sustained interest in the video."}

    if not clips:
        return [], None
    user = f"Video title: {a.meta.title}\nLanguage: {a.meta.language}\n\n" + "\n\n".join(
        f"Clip {i} ({c.end - c.start:.0f}s): {c.text[:1200]}" for i, c in enumerate(clips))
    try:
        data, prov = complete_json(role="write", engine=engine, system=PACK_SYSTEM, user=user, schema=PACK_SCHEMA,
                                   prompt_version="shorts-v1", effort="low")
        by_index = {int(x["index"]): x for x in data.get("shorts", [])}
        return [by_index.get(i) or fallback(i, c) for i, c in enumerate(clips)], prov
    except LLMError:
        return [fallback(i, c) for i, c in enumerate(clips)], None
