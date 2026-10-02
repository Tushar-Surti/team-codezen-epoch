"""Train the interest model on D1 and evaluate it honestly.

Target: YouTube's public "Most replayed" curve, resampled to our 100 bins (relative interest within
each video). Model: LightGBM LambdaRank, one query group per video, on the same bin features the
API computes. Evaluation: GroupKFold by channel, so no channel is ever in both train and test.

Baselines every method is compared against on the same held-out videos:
- position: the average curve shape by position (people always watch the start),
- rules-v0: the hand-weighted engine the app shipped with before training,
- random.

Writes models/interest_lgbm.txt (trained on everything), models/model_card.json and
models/eval_report.json (summary, per-cell, per-video overlays for the Validation Lab and Blind Test).

Run: uv run --package retent-ml python -m retent_ml.train
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from retent_core.contract import N_BINS
from retent_core.engine import HeuristicInterest
from retent_core.features import BIN_FEATURES, build_features
from retent_core.pipeline import sentences_from_captions
from retent_ml.collect import OUT_DIR as D1_DIR, ROOT

MODELS = ROOT / "models"
# Structure: interest = position prior (the average curve shape) + what the script adds on top.
# The residual model only sees text features and is heavily regularized, so with little data it
# stays near the prior instead of chasing noise, and every gain over "position" comes from the text.
POSITION_COLS = ("pct", "t_log", "is_intro", "remaining_s")
TEXT_COLS = tuple(c for c in BIN_FEATURES if c not in POSITION_COLS)
TEXT_IDX = [BIN_FEATURES.index(c) for c in TEXT_COLS]
PARAMS = dict(objective="regression", n_estimators=200, learning_rate=0.03, num_leaves=7,
              min_child_samples=60, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
              reg_lambda=5.0, random_state=7, verbose=-1)


def heat_bins(heat: list[dict], edges: np.ndarray) -> np.ndarray:
    """Resample YouTube's heatmap onto our bin centres."""
    xs = np.array([(h["start_time"] + h["end_time"]) / 2 for h in heat])
    ys = np.array([h["value"] for h in heat], dtype=float)
    mids = (edges[:-1] + edges[1:]) / 2
    return np.interp(mids, xs, ys)


def load_dataset() -> list[dict]:
    rows = []
    for f in sorted(D1_DIR.glob("*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        cap = r["caption"]
        if cap.get("status") != "ok" or len(cap.get("segments") or []) < 20 or len(r.get("heatmap") or []) < 50:
            continue
        sents = sentences_from_captions(cap["segments"])
        if len(sents) < 10:
            continue
        fs = build_features(sents, r["title"], duration=float(r["duration"]))
        y = heat_bins(r["heatmap"], fs.bin_edges)
        rows.append({"id": r["id"], "title": r["title"], "channel": r.get("channel") or r["id"],
                     "cell": f"{r['category']}/{r['seed_lang']}", "duration": float(r["duration"]),
                     "text_kind": cap.get("kind"), "X": fs.bins.astype(np.float32), "y": y})
    return rows


def _z(v: np.ndarray) -> np.ndarray:
    return (v - v.mean()) / (v.std() + 1e-9)


def _smooth(v: np.ndarray, w: int = 3) -> np.ndarray:
    return np.convolve(np.pad(v, w // 2, mode="edge"), np.ones(w) / w, mode="valid")


def position_prior(rows: list[dict]) -> np.ndarray:
    return _smooth(np.mean([_z(r["y"]) for r in rows], axis=0))


SMOOTH = 7  # bins (~7% of the video): attention moves in stretches, not single seconds


class TwoPart:
    def __init__(self, prior: np.ndarray, residual):
        self.prior, self.residual = prior, residual

    def predict(self, X: np.ndarray) -> np.ndarray:
        return _smooth(self.prior + self.residual.predict(X[:, TEXT_IDX]), SMOOTH)


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = a.argsort().argsort().astype(float), b.argsort().argsort().astype(float)
    return float(np.corrcoef(ra, rb)[0, 1]) if ra.std() and rb.std() else 0.0


def _overlap(pred: np.ndarray, actual: np.ndarray, k: int = 10, low: bool = False) -> float:
    """Share of the k most (or least) interesting bins the method found, within ±1 bin."""
    order = (lambda v: v.argsort()[:k]) if low else (lambda v: v.argsort()[::-1][:k])
    p, a = set(order(pred).tolist()), set(order(actual).tolist())
    near = {x + d for x in a for d in (-1, 0, 1)}
    return len(p & near) / k


def _metrics(pred: np.ndarray, actual: np.ndarray) -> dict:
    return {"spearman": _spearman(pred, actual), "peaks_found": _overlap(pred, actual),
            "dips_found": _overlap(pred, actual, low=True)}


def _ci(values: list[float], seed: int = 0) -> tuple[float, float, float]:
    v = np.array(values)
    rng = np.random.default_rng(seed)
    boots = [rng.choice(v, len(v)).mean() for _ in range(2000)]
    return float(v.mean()), float(np.quantile(boots, 0.025)), float(np.quantile(boots, 0.975))


def fit(rows: list[dict]) -> TwoPart:
    import lightgbm as lgb

    prior = position_prior(rows)
    X = np.vstack([r["X"][:, TEXT_IDX] for r in rows])
    y = np.concatenate([_z(r["y"]) - prior for r in rows])
    residual = lgb.LGBMRegressor(**PARAMS)
    residual.fit(X, y, feature_name=list(TEXT_COLS))
    return TwoPart(prior, residual)


def cross_validate(rows: list[dict]) -> list[dict]:
    from sklearn.model_selection import GroupKFold

    groups = [r["channel"] for r in rows]
    n_splits = min(5, len(set(groups)))
    heuristic = HeuristicInterest()
    results = []
    for fold, (tr, te) in enumerate(GroupKFold(n_splits=n_splits).split(rows, groups=groups)):
        train = [rows[i] for i in tr]
        model = fit(train)
        position = np.mean([_z(r["y"]) for r in train], axis=0)
        rng = np.random.default_rng(fold)
        for i in te:
            r = rows[i]
            preds = {
                "model": model.predict(r["X"]),
                "position": position,
                "rules_v0": heuristic.contributions(r["X"]).sum(axis=1),
                "random": rng.normal(size=N_BINS),
            }
            results.append({
                "id": r["id"], "title": r["title"], "channel": r["channel"], "cell": r["cell"], "fold": fold,
                "duration": r["duration"], "text_kind": r["text_kind"],
                "metrics": {name: _metrics(p, r["y"]) for name, p in preds.items()},
                "series": {"actual": np.round(r["y"], 4).tolist(),
                           "model": np.round(_z(preds["model"]), 3).tolist(),
                           "position": np.round(_z(position), 3).tolist()},
            })
    return results


def summarize(results: list[dict]) -> dict:
    methods = list(results[0]["metrics"].keys())
    out: dict = {"overall": {}, "by_cell": {}, "wins": {}}
    for m in methods:
        out["overall"][m] = {k: dict(zip(("mean", "lo", "hi"), _ci([r["metrics"][m][k] for r in results])))
                             for k in ("spearman", "peaks_found", "dips_found")}
    by_cell = defaultdict(list)
    for r in results:
        by_cell[r["cell"]].append(r)
    for cell, rs in sorted(by_cell.items()):
        out["by_cell"][cell] = {"n": len(rs), **{m: float(np.mean([x["metrics"][m]["spearman"] for x in rs]))
                                                 for m in methods}}
    for m in methods:
        if m != "model":
            out["wins"][m] = float(np.mean([r["metrics"]["model"]["spearman"] > r["metrics"][m]["spearman"]
                                            for r in results]))
    return out


def main() -> None:
    rows = load_dataset()
    channels = len({r["channel"] for r in rows})
    print(f"{len(rows)} videos with text from {channels} channels", flush=True)
    if len(rows) < 10 or channels < 3:
        raise SystemExit("Not enough data to train honestly yet (need ≥10 videos from ≥3 channels).")

    results = cross_validate(rows)
    summary = summarize(results)
    model = fit(rows)
    MODELS.mkdir(exist_ok=True)
    model.residual.booster_.save_model(str(MODELS / "interest_lgbm.txt"))
    (MODELS / "position_prior.json").write_text(json.dumps(np.round(model.prior, 5).tolist()), encoding="utf-8")
    importance = dict(sorted(zip(TEXT_COLS, model.residual.booster_.feature_importance("gain").tolist()),
                             key=lambda kv: -kv[1]))
    version = f"lgbm-{datetime.now(UTC).strftime('%Y%m%d-%H%M')}"
    card = {"version": version, "trained_on": len(rows), "channels": channels, "features": list(TEXT_COLS),
            "structure": "position prior (position_prior.json) + residual LightGBM on text features",
            "smooth_bins": SMOOTH,
            "params": PARAMS, "target": "YouTube 'Most replayed', z-scored within each video",
            "evaluation": "GroupKFold by channel", "created_at": datetime.now(UTC).isoformat(),
            "importance_gain": importance}
    (MODELS / "model_card.json").write_text(json.dumps(card, indent=1), encoding="utf-8")
    report = {"version": version, "created_at": card["created_at"], "n_videos": len(rows), "n_channels": channels,
              "cells": {c: sum(r["cell"] == c for r in rows) for c in sorted({r["cell"] for r in rows})},
              "summary": summary, "videos": results}
    (MODELS / "eval_report.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")

    print("\nHeld-out channels, mean over videos (95% CI):")
    print(f"{'method':10s} {'spearman':>22s} {'peaks found':>22s} {'dips found':>22s}")
    for m, v in summary["overall"].items():
        cells = "  ".join(f"{v[k]['mean']:+.3f} [{v[k]['lo']:+.2f},{v[k]['hi']:+.2f}]" for k in ("spearman", "peaks_found", "dips_found"))
        print(f"{m:10s} {cells}")
    print("\nModel beats, per video:", {k: f"{v:.0%}" for k, v in summary["wins"].items()})
    print("Top features:", list(importance)[:8])
    print(f"\nwrote models/interest_lgbm.txt, model_card.json, eval_report.json ({version})")


if __name__ == "__main__":
    main()
