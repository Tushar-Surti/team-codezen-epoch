"""Sentence- and bin-level features: the measured signals behind every prediction and flag.

The same code runs at training time (retent_ml) and serve time (API) for train/serve parity.
Similarity uses a hashed character n-gram space that works across Latin and Devanagari without
model downloads; `Embedder` can be swapped for multilingual-e5 where available.
"""

from __future__ import annotations

import re
import zlib
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np

from retent_core.contract import N_BINS, Language
from retent_core.text import (
    CTA_CUES, FILLER_PHRASES, FILLERS, GREETING_CUES, HOOK_CUES, LOOP_CLOSE_CUES, LOOP_OPEN_CUES,
    OUTRO_CUES, SPONSOR_CUES, content_tokens, has_cue, tokens,
)

QUESTION_START = re.compile(r"^(what|why|how|when|where|which|who|is|are|can|do|does|did|should|would|"
                            r"kya|kyun|kyon|kaise|kab|kahan|kaun|क्या|क्यों|कैसे|कब|कहां|कौन)\b", re.I)
YOU_WORDS = {"you", "your", "you're", "yourself", "aap", "aapka", "aapke", "aapko", "tum", "tumhara",
             "आप", "आपका", "आपके", "आपको", "तुम"}

SENTENCE_FEATURES = (
    "wps", "filler_rate", "question", "you_rate", "numeral_rate", "novelty", "redundancy",
    "promise_sim", "topic_sim", "cta", "sponsor", "outro", "greeting", "hook", "loop_open",
    "loop_close", "complexity",
)
# Measured from an uploaded video (rough-cut mode); zero for scripts and transcripts.
MEDIA_FEATURES = ("static_shot", "silence")
BIN_FEATURES = SENTENCE_FEATURES + ("pct", "t_log", "is_intro", "since_last_hook", "remaining_s") + MEDIA_FEATURES
STATIC_SHOT_S = 30.0  # a single shot longer than this reads as visually static


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> np.ndarray: ...


class HashedNgramEmbedder:
    """Hashed char 3–5-grams + word unigrams, L2-normalized. Script-agnostic and dependency-free."""

    def __init__(self, dim: int = 4096):
        self.dim = dim

    def embed(self, texts: list[str]) -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, text in enumerate(texts):
            toks = content_tokens(text)
            for tok in toks:
                out[i, zlib.crc32(("w:" + tok).encode()) % self.dim] += 2.0
                padded = f" {tok} "
                for n in (3, 4, 5):
                    for j in range(len(padded) - n + 1):
                        out[i, zlib.crc32(padded[j : j + n].encode()) % self.dim] += 1.0
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        return out / np.maximum(norms, 1e-9)


@dataclass
class TimedSentence:
    id: str
    text: str
    start: float
    end: float
    lang: Language


@dataclass
class FeatureSet:
    sentences: list[TimedSentence]
    duration: float
    sent: np.ndarray  # (n_sentences, len(SENTENCE_FEATURES))
    bins: np.ndarray  # (N_BINS, len(BIN_FEATURES))
    sim: np.ndarray  # (n_sentences, n_sentences) cosine similarity
    vectors: np.ndarray  # (n_sentences, dim)
    title_vector: np.ndarray
    bin_edges: np.ndarray  # (N_BINS + 1,)
    extras: dict = field(default_factory=dict)

    def s(self, name: str) -> np.ndarray:
        return self.sent[:, SENTENCE_FEATURES.index(name)]

    def b(self, name: str) -> np.ndarray:
        return self.bins[:, BIN_FEATURES.index(name)]


def _apply_semantic(sentences: list[TimedSentence], feats: np.ndarray, semantic) -> None:
    """LLM labels replace keyword cues for every line the semantic pass saw (same columns, so a
    model trained on labelled data reads them the same way)."""
    col = {name: i for i, name in enumerate(SENTENCE_FEATURES)}
    opens = {lp["open"] for lp in semantic.loops}
    closes = {lp["close"] for lp in semantic.loops if lp.get("close")}
    known = getattr(semantic, "known_ids", None)
    for i, s in enumerate(sentences):
        if known is not None and s.id not in known:
            continue  # lines added by an edit keep keyword cues unless the edit labelled them
        role = semantic.roles.get(s.id)
        feats[i, col["hook"]] = float(role == "hook" or s.id == semantic.hook_id)
        feats[i, col["greeting"]] = float(role == "greeting")
        # Asks and sponsor reads keep their precise keyword cues too ("subscribe", "sponsored by"):
        # a span labelled "greeting" can still contain a subscribe ask.
        feats[i, col["cta"]] = float(role == "cta" or feats[i, col["cta"]] > 0)
        feats[i, col["sponsor"]] = float(role == "sponsor" or feats[i, col["sponsor"]] > 0)
        # Wrap-up phrases keep their keyword cue too: the model often labels a mid-video sign-off as content.
        feats[i, col["outro"]] = float(role == "outro" or feats[i, col["outro"]] > 0)
        feats[i, col["loop_open"]] = float(s.id in opens)
        feats[i, col["loop_close"]] = float(s.id in closes or role == "payoff")
        if role == "tangent":
            feats[i, col["topic_sim"]] = min(feats[i, col["topic_sim"]], 0.05)
            feats[i, col["promise_sim"]] = min(feats[i, col["promise_sim"]], 0.0)
        elif role == "filler":
            feats[i, col["novelty"]] = min(feats[i, col["novelty"]], 0.15)
        elif role == "payoff":
            feats[i, col["promise_sim"]] = max(feats[i, col["promise_sim"]], 0.35)


def _sentence_features(
    sentences: list[TimedSentence], vectors: np.ndarray, title_vec: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    n = len(sentences)
    feats = np.zeros((n, len(SENTENCE_FEATURES)), dtype=np.float32)
    sim = vectors @ vectors.T
    centroid = vectors.mean(axis=0)
    centroid /= max(np.linalg.norm(centroid), 1e-9)
    seen: set[str] = set()
    col = {name: i for i, name in enumerate(SENTENCE_FEATURES)}

    for i, s in enumerate(sentences):
        toks = tokens(s.text)
        n_tok = max(1, len(toks))
        dur = max(0.5, s.end - s.start)
        low = s.text.lower()
        fillers = sum(t in FILLERS for t in toks) + sum(low.count(p) for p in FILLER_PHRASES)
        ctoks = content_tokens(s.text)
        new = [t for t in ctoks if t not in seen]
        seen.update(ctoks)
        # Repetition of anything said earlier, ignoring the immediately preceding sentences.
        prior = sim[i, : max(0, i - 2)]
        feats[i, col["wps"]] = n_tok / dur
        feats[i, col["filler_rate"]] = fillers / n_tok
        feats[i, col["question"]] = float(s.text.strip().endswith("?") or bool(QUESTION_START.match(s.text.strip())))
        feats[i, col["you_rate"]] = sum(t in YOU_WORDS for t in toks) / n_tok
        feats[i, col["numeral_rate"]] = sum(any(ch.isdigit() for ch in t) for t in toks) / n_tok
        feats[i, col["novelty"]] = len(new) / max(1, len(ctoks)) if ctoks else 0.0
        feats[i, col["redundancy"]] = float(prior.max()) if prior.size else 0.0
        feats[i, col["promise_sim"]] = float(vectors[i] @ title_vec)
        feats[i, col["topic_sim"]] = float(vectors[i] @ centroid)
        feats[i, col["cta"]] = float(has_cue(s.text, CTA_CUES))
        feats[i, col["sponsor"]] = float(has_cue(s.text, SPONSOR_CUES))
        feats[i, col["outro"]] = float(has_cue(s.text, OUTRO_CUES))
        is_greeting = has_cue(s.text, GREETING_CUES) or bool(re.search(r"\b(kaise ho|how are you|kya haal)\b", low))
        feats[i, col["greeting"]] = float(is_greeting)
        feats[i, col["hook"]] = float(not is_greeting and (has_cue(s.text, HOOK_CUES)
                                                          or (i < 6 and feats[i, col["question"]] > 0)))
        feats[i, col["loop_open"]] = float(has_cue(s.text, LOOP_OPEN_CUES))
        feats[i, col["loop_close"]] = float(has_cue(s.text, LOOP_CLOSE_CUES))
        latin = [t for t in ctoks if t.isascii()]
        feats[i, col["complexity"]] = (sum(len(t) >= 10 for t in latin) / max(1, len(latin))) if latin else 0.0

    # Novelty decays naturally as a video goes on (everything is new at the start). Keep only the
    # part a position trend can't explain: residual from a log-position fit, re-centred on 0.55.
    nov = feats[:, col["novelty"]]
    if n >= 8:
        x = np.log1p(np.arange(n))
        slope, intercept = np.polyfit(x, nov, 1)
        feats[:, col["novelty"]] = np.clip(nov - (slope * x + intercept) + 0.55, 0, 1)
    return feats, sim


def _bin_matrix(sentences: list[TimedSentence], sent: np.ndarray, duration: float) -> tuple[np.ndarray, np.ndarray]:
    edges = np.linspace(0.0, duration, N_BINS + 1)
    bins = np.zeros((N_BINS, len(BIN_FEATURES)), dtype=np.float32)  # media columns filled in build_features
    k = len(SENTENCE_FEATURES)
    starts = np.array([s.start for s in sentences])
    ends = np.array([s.end for s in sentences])
    hook_col = SENTENCE_FEATURES.index("hook")
    last_hook = -1e9
    for b in range(N_BINS):
        lo, hi = edges[b], edges[b + 1]
        overlap = np.clip(np.minimum(ends, hi) - np.maximum(starts, lo), 0, None)
        w = overlap.sum()
        if w > 0:
            bins[b, :k] = (sent * overlap[:, None]).sum(axis=0) / w
            # Event cues should register in any bin they touch, not be diluted by overlap weight.
            for name in ("cta", "sponsor", "outro", "greeting", "hook", "loop_open", "loop_close"):
                c = SENTENCE_FEATURES.index(name)
                bins[b, c] = float((sent[overlap > 0, c]).max())
            if bins[b, hook_col] > 0:
                last_hook = (lo + hi) / 2
        else:
            # Silence or a gap: no words, no novelty.
            bins[b, :k] = 0.0
        mid = (lo + hi) / 2
        bins[b, k + 0] = mid / duration
        bins[b, k + 1] = np.log1p(mid)
        bins[b, k + 2] = float(mid < 30.0)
        bins[b, k + 3] = min(120.0, mid - last_hook) if last_hook > -1e8 else min(120.0, mid)
        bins[b, k + 4] = duration - mid
    return bins, edges


def _apply_media(bins: np.ndarray, edges: np.ndarray, media: dict) -> None:
    """media = {"duration": s, "cuts": [t, ...], "silences": [[start, end], ...]} from ffmpeg."""
    dur = float(media.get("duration") or edges[-1])
    cuts = sorted(t for t in media.get("cuts", []) if 0 < t < dur)
    bounds = [0.0, *cuts, dur]
    shots = [(a, b) for a, b in zip(bounds[:-1], bounds[1:]) if b - a >= STATIC_SHOT_S]
    col_static = BIN_FEATURES.index("static_shot")
    col_silence = BIN_FEATURES.index("silence")
    for k in range(len(edges) - 1):
        lo, hi = edges[k], edges[k + 1]
        width = max(hi - lo, 1e-6)
        bins[k, col_static] = sum(max(0.0, min(b, hi) - max(a, lo)) for a, b in shots) / width
        bins[k, col_silence] = sum(max(0.0, min(e, hi) - max(s, lo)) for s, e in media.get("silences", [])) / width


def build_features(
    sentences: list[TimedSentence],
    title: str,
    thumbnail_text: str | None = None,
    embedder: Embedder | None = None,
    semantic=None,
    duration: float | None = None,
    media: dict | None = None,
) -> FeatureSet:
    """`duration` is the real video length when known (captions often end before the outro),
    so the 100 bins line up with YouTube's own 1% grid."""
    if not sentences:
        raise ValueError("No sentences to analyze.")
    embedder = embedder or HashedNgramEmbedder()
    vectors = embedder.embed([s.text for s in sentences])
    promise = " ".join(filter(None, [title, thumbnail_text]))
    title_vec = embedder.embed([promise])[0]
    sent, sim = _sentence_features(sentences, vectors, title_vec)
    if semantic is not None:
        _apply_semantic(sentences, sent, semantic)
    duration = max(duration or 0.0, max(s.end for s in sentences))
    bins, edges = _bin_matrix(sentences, sent, duration)
    if media:
        _apply_media(bins, edges, media)
    return FeatureSet(sentences, duration, sent, bins, sim, vectors, title_vec, edges,
                      {"semantic": semantic, "media": media})


def redundancy_matrix(fs: FeatureSet, size: int = 48) -> np.ndarray:
    """Self-similarity between equal time slices (recurrence plot)."""
    edges = np.linspace(0, fs.duration, size + 1)
    starts = np.array([s.start for s in fs.sentences])
    ends = np.array([s.end for s in fs.sentences])
    slices = np.zeros((size, fs.vectors.shape[1]), dtype=np.float32)
    for i in range(size):
        overlap = np.clip(np.minimum(ends, edges[i + 1]) - np.maximum(starts, edges[i]), 0, None)
        slices[i] = (fs.vectors * overlap[:, None]).sum(axis=0)
    norms = np.linalg.norm(slices, axis=1, keepdims=True)
    slices /= np.maximum(norms, 1e-9)
    m = np.clip(slices @ slices.T, 0, 1)
    return m
