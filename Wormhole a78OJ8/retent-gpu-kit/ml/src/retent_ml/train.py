"""Train the interest model on transcribed videos: bin features → relative "Most replayed" intensity.

Target per video: the heatmap sampled at each feature bin, log-scaled and z-scored within the video
(the engine only uses relative interest). Validation holds out whole channels so the score reflects
new creators, and compares against the heuristic scorer and a position-only model.

Run: uv run --no-sync python -m retent_ml.train [--data data/raw/d1] [--out outputs/model/interest-lgbm-v1]
"""

from __future__ import annotations

import argparse
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import lightgbm as lgb
import numpy as np
from sklearn.model_selection import GroupKFold

from retent_core.contract import N_BINS
from retent_core.engine import HeuristicInterest
from retent_core.features import BIN_FEATURES, build_features
from retent_core.pipeline import sentences_from_captions

POSITION = ["pct", "t_log", "is_intro", "remaining_s"]
PARAMS = dict(objective="regression", learning_rate=0.03, num_leaves=15, min_data_in_leaf=120,
              feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=5.0, verbose=-1, seed=7)
README = """# Retent interest model: {name}

LightGBM interest scorer for retent_core's engine, trained on {n} transcribed videos
(Whisper large-v3 + YouTube captions), with each video's YouTube "Most replayed" curve as the target.

## Use

1. Copy `interest.py` to `ml/src/retent_ml/interest.py` and the `{name}/` folder anywhere.
2. `uv sync` (needs `lightgbm`, already in retent-ml's dependencies).
3. Pass the model to the pipeline:

```python
from retent_ml.interest import LGBMInterest
model = LGBMInterest.load("path/to/{name}")
analysis = analyze_sentences(sents, meta, model=model)   # or simulator.run(..., model=model)
```

Contributions are exact SHAP values per feature, so flags and fixes work unchanged.

## How good

Per-video Spearman correlation with the real curve after the first 10% of the video, on held-out
channels (5-fold, grouped by channel): **{lgbm}** for this model, {pos} for timing alone, {heur} for the
heuristic-v0 scorer. It picks up where interest rises and falls; it is not an exact curve. Full
numbers, per-cell scores and feature gains are in `card.json`.
"""


def _target(rec: dict, mids: np.ndarray) -> np.ndarray:
    heat = rec["heatmap"]
    xs = np.array([(p["start_time"] + p["end_time"]) / 2 for p in heat])
    ys = np.array([p["value"] for p in heat])
    h = np.log(np.interp(mids, xs, ys) + 0.05)
    return (h - h.mean()) / (h.std() + 1e-6)


def load(data: Path) -> list[dict]:
    rows = []
    for f in sorted(data.glob("*.json")):
        rec = json.loads(f.read_text(encoding="utf-8"))
        cap = rec.get("caption") or {}
        segs = cap.get("segments") or []
        if cap.get("status") != "ok" or len(segs) < 15 or len(rec.get("heatmap") or []) < 20:
            continue
        sents = sentences_from_captions(segs)
        if len(sents) < 15:
            continue
        fs = build_features(sents, rec.get("title") or "", None)
        if fs.duration < 0.5 * float(rec["duration"]):
            continue  # transcript covers too little of the video to line up with the curve
        mids = (fs.bin_edges[:-1] + fs.bin_edges[1:]) / 2
        rows.append(dict(id=rec["id"], channel=rec.get("channel_id") or rec.get("channel"),
                         cell=f"{rec['category']}/{rec['seed_lang']}", source=cap.get("kind"),
                         X=fs.bins.astype(np.float64), y=_target(rec, mids)))
        print(f"\r  featurized {len(rows)}", end="", flush=True)
    print()
    return rows


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def _score(pred: np.ndarray, y: np.ndarray) -> dict:
    """Per-video agreement with the real curve: all bins, and past the intro (where edits matter)."""
    body = slice(10, N_BINS)
    return {"spearman": _spearman(pred, y), "spearman_body": _spearman(pred[body], y[body]),
            "top10_hit": len(set(np.argsort(-pred[body])[:10]) & set(np.argsort(-y[body])[:10])) / 10}


def _fit(X, y, cols, rounds):
    return lgb.train(PARAMS, lgb.Dataset(X[:, cols], y, feature_name=[BIN_FEATURES[c] for c in cols]), rounds)


def cross_validate(rows: list[dict], rounds: int, folds: int = 5) -> dict:
    groups = np.array([r["channel"] for r in rows])
    allc = list(range(len(BIN_FEATURES)))
    posc = [BIN_FEATURES.index(c) for c in POSITION]
    heur = HeuristicInterest()
    res = {k: [] for k in ("lgbm", "position_only", "heuristic")}
    cells = []
    for tr, te in GroupKFold(n_splits=folds).split(rows, groups=groups):
        Xtr = np.vstack([rows[i]["X"] for i in tr])
        ytr = np.concatenate([rows[i]["y"] for i in tr])
        full, pos = _fit(Xtr, ytr, allc, rounds), _fit(Xtr, ytr, posc, rounds)
        for i in te:
            X, y = rows[i]["X"], rows[i]["y"]
            res["lgbm"].append(_score(full.predict(X), y))
            res["position_only"].append(_score(pos.predict(X[:, posc]), y))
            res["heuristic"].append(_score(heur.contributions(X).sum(axis=1), y))
            cells.append(rows[i]["cell"])
    summary = {name: {k: round(float(np.mean([s[k] for s in sc])), 3) for k in sc[0]} for name, sc in res.items()}
    by_cell = {}
    for cell in sorted(set(cells)):
        idx = [j for j, c in enumerate(cells) if c == cell]
        by_cell[cell] = {"videos": len(idx), **{name: round(float(np.mean([res[name][j]["spearman_body"] for j in idx])), 3)
                                                for name in res}}
    return {"overall": summary, "spearman_body_by_cell": by_cell}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/raw/d1")
    ap.add_argument("--out", default="outputs/model/interest-lgbm-v1")
    ap.add_argument("--rounds", type=int, default=400)
    args = ap.parse_args()

    rows = load(Path(args.data))
    print(f"videos: {len(rows)}  channels: {len({r['channel'] for r in rows})}")
    cv = cross_validate(rows, args.rounds)
    print(json.dumps(cv, indent=1))

    X = np.vstack([r["X"] for r in rows])
    y = np.concatenate([r["y"] for r in rows])
    booster = _fit(X, y, list(range(len(BIN_FEATURES))), args.rounds)
    imp = dict(zip(BIN_FEATURES, booster.feature_importance("gain").round(1).tolist()))

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(out / "model.txt"))
    cells = {}
    for r in rows:
        cells[r["cell"]] = cells.get(r["cell"], 0) + 1
    card = {
        "version": out.name, "trained_on": len(rows), "trained_at": datetime.now(UTC).isoformat(),
        "target": "within-video z-score of log(Most replayed + 0.05), sampled at the 100 feature bins",
        "features": list(BIN_FEATURES), "params": PARAMS, "rounds": args.rounds,
        "videos_by_cell": dict(sorted(cells.items())),
        "validation": {"method": "5-fold GroupKFold by channel (held-out creators)", **cv},
        "feature_gain": dict(sorted(imp.items(), key=lambda kv: -kv[1])),
    }
    (out / "card.json").write_text(json.dumps(card, indent=1), encoding="utf-8")

    # One file to share: model, card, the loader, and how to use them.
    zpath = out.parent / f"{out.name}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(out / "model.txt", f"{out.name}/model.txt")
        z.write(out / "card.json", f"{out.name}/card.json")
        z.write(Path(__file__).with_name("interest.py"), "interest.py")
        z.writestr("README.md", README.format(name=out.name, n=len(rows),
                                              lgbm=cv["overall"]["lgbm"]["spearman_body"],
                                              pos=cv["overall"]["position_only"]["spearman_body"],
                                              heur=cv["overall"]["heuristic"]["spearman_body"]))
    print(f"saved {out} and {zpath}")


if __name__ == "__main__":
    main()
