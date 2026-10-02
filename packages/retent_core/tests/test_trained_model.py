"""The trained model (when present) plugs into the engine with the same contract."""

from pathlib import Path

import numpy as np
import pytest

from retent_core.contract import N_BINS
from retent_core.engine import TrainedInterest
from retent_core.features import BIN_FEATURES

MODELS = Path(__file__).resolve().parents[3] / "models"


@pytest.mark.skipif(not (MODELS / "interest_lgbm.txt").exists(), reason="no trained model on this machine")
def test_trained_model_contributions_shape_and_version():
    m = TrainedInterest(MODELS)
    assert m.version.startswith("lgbm-") and m.trained_on > 0
    bins = np.random.default_rng(0).random((N_BINS, len(BIN_FEATURES))).astype(np.float32)
    c = m.contributions(bins)
    assert c.shape == (N_BINS, len(BIN_FEATURES)) and np.isfinite(c).all()
