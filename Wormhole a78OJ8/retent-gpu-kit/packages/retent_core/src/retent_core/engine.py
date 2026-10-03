"""Retention engine: interest model → discrete-time hazard → absolute retention curve.

    h_i = 1 − (1 − h0_i) ** exp(−β · interest_i)        R_i = Π_{j ≤ i} (1 − h_j)

`h0` is the category baseline hazard (intro cliff, steady decay, end-screen exit). The interest
model scores each bin relative to the video. `HeuristicInterest` is the rules-only v0 scorer; the
trained LightGBM ranker (retent_ml) implements the same `InterestModel` protocol and replaces it
once trained. Until baseline parameters are fitted on real Studio curves (dataset D2), curves are
marked "uncalibrated" and no "typical" band is shown.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Protocol

import numpy as np

from retent_core.contract import INTRO_SECONDS, N_BINS, Category
from retent_core.features import BIN_FEATURES, FeatureSet


class InterestModel(Protocol):
    version: str
    trained_on: int

    def contributions(self, bins: np.ndarray) -> np.ndarray:
        """(N_BINS, n_features) additive contributions to relative interest (log-hazard units)."""
        ...


# Signal families group raw features into what a creator can act on.
FAMILIES: dict[str, tuple[str, str]] = {
    "novelty": ("low_density", "Little new information"),
    "redundancy": ("repetition", "Repeats earlier material"),
    "promise_sim": ("off_promise", "Off the title's promise"),
    "topic_sim": ("off_topic", "Drifts from the topic"),
    "filler_rate": ("fillers", "Filler words"),
    "wps": ("pace", "Slow delivery"),
    "question": ("curiosity", "Questions"),
    "you_rate": ("direct_address", "Talks to the viewer"),
    "numeral_rate": ("specifics", "Concrete numbers"),
    "cta": ("ask", "Asks for likes or subscribes"),
    "sponsor": ("sponsor", "Sponsor read"),
    "outro": ("wrap_up", "Wrap-up language"),
    "greeting": ("greeting", "Greeting before value"),
    "hook": ("hook", "Hook"),
    "loop_open": ("open_loop", "Opens a curiosity loop"),
    "loop_close": ("payoff", "Pays off a loop"),
    "complexity": ("jargon", "Dense jargon"),
    "since_last_hook": ("no_hook", "Long stretch without a hook"),
}


@dataclass(frozen=True)
class Baseline:
    """Category prior for the hazard baseline. Uncalibrated defaults until fitted on D2."""

    intro_drop: float = 0.26  # share of starters gone by ~0:30 at neutral interest
    intro_tau: float = 11.0  # seconds; how fast the intro cliff happens
    decay_per_min: float = 0.052  # steady-state share of remaining viewers lost per minute
    end_drop: float = 0.18  # share leaving in the end-screen tail
    end_share: float = 0.035  # tail length as share of duration
    beta: float = 0.55  # how strongly interest moves hazard
    calibrated_n: int = 0


BASELINES: dict[str, Baseline] = {
    Category.tech: Baseline(intro_drop=0.27, decay_per_min=0.066),
    Category.education: Baseline(intro_drop=0.24, decay_per_min=0.058),
    Category.vlog: Baseline(intro_drop=0.29, decay_per_min=0.070),
}


def load_baselines(path: Path) -> None:
    """Override priors with parameters fitted on real curves (written by retent_ml)."""
    if path.exists():
        for cat, params in json.loads(path.read_text()).items():
            BASELINES[cat] = Baseline(**params)


class HeuristicInterest:
    """Rules-only v0 interest scorer: fixed, documented weights on standardized features."""

    version = "heuristic-v0"
    trained_on = 0

    # (reference mean, reference scale, weight). Positive weight = holds attention.
    SPEC: dict[str, tuple[float, float, float]] = {
        "novelty": (0.55, 0.25, 0.55),
        "redundancy": (0.25, 0.15, -0.70),
        "promise_sim": (0.10, 0.08, 0.40),
        "topic_sim": (0.30, 0.12, 0.25),
        "filler_rate": (0.03, 0.04, -0.45),
        "wps": (2.5, 0.6, 0.20),
        "question": (0.10, 0.30, 0.15),
        "you_rate": (0.03, 0.04, 0.15),
        "numeral_rate": (0.02, 0.04, 0.10),
        "cta": (0.0, 1.0, -0.55),
        "sponsor": (0.0, 1.0, -0.85),
        "outro": (0.0, 1.0, -0.90),
        "greeting": (0.0, 1.0, -0.45),
        "hook": (0.0, 1.0, 0.50),
        "loop_open": (0.0, 1.0, 0.35),
        "loop_close": (0.0, 1.0, 0.20),
        "complexity": (0.08, 0.08, -0.20),
        "since_last_hook": (40.0, 30.0, -0.20),
    }

    def contributions(self, bins: np.ndarray) -> np.ndarray:
        out = np.zeros((bins.shape[0], len(BIN_FEATURES)), dtype=np.float32)
        for name, (mu, sd, w) in self.SPEC.items():
            col = BIN_FEATURES.index(name)
            z = np.clip((bins[:, col] - mu) / sd, -3, 3)
            out[:, col] = w * z
        # A greeting only hurts in the intro; wrap-up language only hurts with time left.
        pct = bins[:, BIN_FEATURES.index("pct")]
        out[:, BIN_FEATURES.index("greeting")] *= pct < 0.12
        out[:, BIN_FEATURES.index("outro")] *= pct < 0.92
        return out


@dataclass
class Prediction:
    retention: np.ndarray  # survival after each bin (N_BINS,)
    lo: np.ndarray
    hi: np.ndarray
    hazard: np.ndarray
    base_hazard: np.ndarray
    interest: np.ndarray  # z-scored within the video
    contributions: np.ndarray  # (N_BINS, n_features)
    edges: np.ndarray
    duration: float
    baseline: Baseline
    center: float  # median raw interest (relative scoring is centred per video)
    scale: float
    intro_factor: float  # multiplier on the intro cliff from measured opening signals
    damp: np.ndarray  # per-bin damping of interest modulation (intro bins are damped)

    def at(self, seconds: float) -> float:
        """Retention at an arbitrary time (linear between bin edges)."""
        xs = self.edges
        ys = np.concatenate([[1.0], self.retention])
        return float(np.interp(seconds, xs, ys))


def base_hazard(edges: np.ndarray, base: Baseline) -> np.ndarray:
    duration = edges[-1]
    mid = (edges[:-1] + edges[1:]) / 2
    width = np.diff(edges)
    # Intro cliff: cumulative share gone follows intro_drop * (1 - exp(-t/tau)).
    intro_cum = base.intro_drop * (1 - np.exp(-edges / base.intro_tau))
    intro_h = np.diff(intro_cum) / np.maximum(1 - intro_cum[:-1], 1e-6)
    steady_h = 1 - (1 - base.decay_per_min) ** (width / 60.0)
    tail_start = duration * (1 - base.end_share)
    tail_h = np.where(mid >= tail_start, base.end_drop * width / max(duration - tail_start, 1e-6), 0.0)
    return np.clip(1 - (1 - intro_h) * (1 - steady_h) * (1 - tail_h), 0, 0.95)


def _integrate(h0: np.ndarray, z: np.ndarray, beta: float) -> tuple[np.ndarray, np.ndarray]:
    h = 1 - (1 - h0) ** np.exp(-beta * np.clip(z, -3, 3))
    return np.cumprod(1 - h), h


def intro_factor(fs: FeatureSet) -> float:
    """Scale the intro cliff from what the opening measurably does (hook timing, greetings, questions)."""
    first = [i for i, s in enumerate(fs.sentences) if s.start < 15.0] or [0]
    hook_early = fs.s("hook")[first].max() > 0
    greet = fs.s("greeting")[[i for i, s in enumerate(fs.sentences) if s.start < 10.0] or [0]].max() > 0
    question = fs.s("question")[first].max() > 0
    promise = fs.s("promise_sim")[first].max()
    f = 1.0 + 0.22 * (not hook_early) + 0.14 * greet - 0.08 * question - 0.6 * max(0.0, promise - 0.15)
    return float(np.clip(f, 0.7, 1.45))


def predict(fs: FeatureSet, category: str, model: InterestModel | None = None) -> Prediction:
    model = model or HeuristicInterest()
    base = BASELINES.get(category, Baseline())
    ifac = intro_factor(fs)
    base = replace(base, intro_drop=min(0.6, base.intro_drop * ifac))
    contrib = model.contributions(fs.bins)
    raw = contrib.sum(axis=1)
    center, scale = float(np.median(raw)), float(raw.std() + 1e-6)
    # The intro cliff is set by intro_factor; in-bin modulation is damped there so the two don't double count.
    damp = np.where((fs.bin_edges[:-1] + fs.bin_edges[1:]) / 2 < 30.0, 0.35, 1.0)
    z = (raw - center) / scale * damp
    h0 = base_hazard(fs.bin_edges, base)
    retention, hazard = _integrate(h0, z, base.beta)
    # Uncertainty: vary interest strength and intro depth; uncalibrated curves get a wider band.
    widen = 1.0 if base.calibrated_n else 1.6
    lo_base = replace(base, intro_drop=min(0.6, base.intro_drop * (1 + 0.22 * widen)),
                      decay_per_min=base.decay_per_min * (1 + 0.25 * widen))
    hi_base = replace(base, intro_drop=base.intro_drop * (1 - 0.22 * widen),
                      decay_per_min=base.decay_per_min * (1 - 0.25 * widen))
    lo, _ = _integrate(base_hazard(fs.bin_edges, lo_base), z, base.beta * (1 + 0.3 * widen))
    hi, _ = _integrate(base_hazard(fs.bin_edges, hi_base), z, base.beta * (1 - 0.3 * widen))
    return Prediction(retention, np.minimum(lo, retention), np.maximum(hi, retention), hazard, h0, z,
                      contrib, fs.bin_edges, fs.duration, base, center, scale, ifac, damp)


def counterfactual_retention(pred: Prediction, mask_bins: np.ndarray, feature_cols: list[int],
                             neutral_intro: bool = False) -> np.ndarray:
    """Retention if the listed features' *negative* contributions were neutral within the masked bins.

    `neutral_intro` also removes the measured opening penalty (used for late-hook flags)."""
    contrib = pred.contributions.copy()
    for c in feature_cols:
        contrib[mask_bins, c] = np.maximum(contrib[mask_bins, c], 0.0)
    z = (contrib.sum(axis=1) - pred.center) / pred.scale * pred.damp
    h0 = pred.base_hazard
    if neutral_intro and pred.intro_factor > 1.0:
        h0 = base_hazard(pred.edges, replace(pred.baseline, intro_drop=pred.baseline.intro_drop / pred.intro_factor))
    retention, _ = _integrate(h0, z, pred.baseline.beta)
    return retention


@dataclass
class CurveMetrics:
    intro_retention: float
    apv: float
    avd_seconds: float


def summarize(pred: Prediction) -> CurveMetrics:
    # Average of the continuous survival curve, trapezoid over bin edges.
    ys = np.concatenate([[1.0], pred.retention])
    apv = float(np.trapezoid(ys, pred.edges) / pred.duration)
    return CurveMetrics(
        intro_retention=pred.at(min(INTRO_SECONDS, pred.duration)),
        apv=apv,
        avd_seconds=apv * pred.duration,
    )


def key_moments(pred: Prediction, top_dips: int = 3, top_spikes: int = 2) -> list[dict]:
    """Dips: bins where the hazard most exceeds baseline. Spikes: most interesting bins past the intro."""
    mid = (pred.edges[:-1] + pred.edges[1:]) / 2
    excess = (pred.hazard - pred.base_hazard) * np.concatenate([[1.0], pred.retention[:-1]])
    moments: list[dict] = [{
        "kind": "intro", "start": 0.0, "end": min(INTRO_SECONDS, pred.duration),
        "magnitude": round((1 - pred.at(INTRO_SECONDS)) * 100, 1), "label": "Intro",
    }]
    used = np.zeros(N_BINS, dtype=bool)
    for idx in np.argsort(-excess):
        if len([m for m in moments if m["kind"] == "dip"]) >= top_dips or excess[idx] <= 0.002:
            break
        if used[max(0, idx - 3) : idx + 4].any() or mid[idx] < INTRO_SECONDS:
            continue
        lo, hi = idx, idx
        while lo > 0 and excess[lo - 1] > excess[idx] * 0.4:
            lo -= 1
        while hi < N_BINS - 1 and excess[hi + 1] > excess[idx] * 0.4:
            hi += 1
        used[lo : hi + 1] = True
        moments.append({"kind": "dip", "start": float(pred.edges[lo]), "end": float(pred.edges[hi + 1]),
                        "magnitude": round(float(excess[lo : hi + 1].sum()) * 100, 1), "label": "Dip"})
    order = np.argsort(-pred.interest)
    spikes = 0
    for idx in order:
        if spikes >= top_spikes:
            break
        if mid[idx] < pred.duration * 0.1 or used[max(0, idx - 2) : idx + 3].any():
            continue
        used[max(0, idx - 2) : idx + 3] = True
        spikes += 1
        moments.append({"kind": "spike", "start": float(pred.edges[idx]), "end": float(pred.edges[idx + 1]),
                        "magnitude": round(float(pred.interest[idx]), 2), "label": "Spike"})
    return moments
