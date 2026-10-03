"""Trained interest model: LightGBM on the engine's bin features, fitted to YouTube "Most replayed" curves.

Implements retent_core.engine.InterestModel, so it drops in wherever the heuristic scorer is used:

    from retent_ml.interest import LGBMInterest
    model = LGBMInterest.load("interest-lgbm-v1")      # folder with model.txt + card.json
    analysis = analyze_sentences(sents, meta, model=model)

Per-feature contributions are LightGBM's exact SHAP values, so flags and fixes keep working per family.
"""

from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np

from retent_core.features import BIN_FEATURES


class LGBMInterest:
    def __init__(self, booster: lgb.Booster, card: dict):
        if list(booster.feature_name()) != list(BIN_FEATURES):
            raise ValueError("Model was trained on a different feature set than this retent_core.")
        self.booster = booster
        self.card = card
        self.version = card.get("version", "lgbm")
        self.trained_on = int(card.get("trained_on", 0))

    @classmethod
    def load(cls, folder: str | Path) -> "LGBMInterest":
        folder = Path(folder)
        card = json.loads((folder / "card.json").read_text(encoding="utf-8"))
        return cls(lgb.Booster(model_file=str(folder / "model.txt")), card)

    def contributions(self, bins: np.ndarray) -> np.ndarray:
        # Last column is the bias term; the engine centres scores per video, so it can be dropped.
        contrib = self.booster.predict(np.asarray(bins, dtype=np.float64), pred_contrib=True)
        return contrib[:, :-1].astype(np.float32)
