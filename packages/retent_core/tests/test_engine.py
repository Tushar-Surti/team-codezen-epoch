import numpy as np

from retent_core.contract import N_BINS
from retent_core.engine import key_moments, predict, summarize
from retent_core.features import BIN_FEATURES, SENTENCE_FEATURES, build_features


def test_feature_shapes(sample_sentences, sample):
    fs = build_features(sample_sentences, sample["title"], sample["thumbnail_text"])
    n = len(sample_sentences)
    assert fs.sent.shape == (n, len(SENTENCE_FEATURES))
    assert fs.bins.shape == (N_BINS, len(BIN_FEATURES))
    assert fs.sim.shape == (n, n)
    assert len(fs.bin_edges) == N_BINS + 1
    assert np.isclose(fs.bin_edges[-1], fs.duration)


def test_cue_features_fire_on_the_sample(sample_sentences, sample):
    fs = build_features(sample_sentences, sample["title"], sample["thumbnail_text"])
    assert fs.s("greeting")[0] == 1  # "Hello doston, kaise ho aap sab?"
    assert fs.s("cta")[:4].max() == 1  # "channel ko subscribe kar lo"
    assert fs.s("sponsor")[:8].max() == 1  # CloudVault read


def test_curve_is_a_valid_survival_curve(sample_sentences, sample):
    fs = build_features(sample_sentences, sample["title"], sample["thumbnail_text"])
    pred = predict(fs, "tech")
    r = pred.retention
    assert r.shape == (N_BINS,)
    assert np.all((r >= 0) & (r <= 1))
    assert np.all(np.diff(r) <= 1e-9), "retention never rises"
    assert np.all(pred.lo <= r + 1e-9) and np.all(pred.hi >= r - 1e-9)
    m = summarize(pred)
    assert 0 < m.apv < 1
    assert 0 < m.intro_retention < 1
    assert np.isclose(m.avd_seconds, m.apv * fs.duration)


def test_key_moments_start_with_the_intro(sample_sentences, sample):
    fs = build_features(sample_sentences, sample["title"], sample["thumbnail_text"])
    moments = key_moments(predict(fs, "tech"))
    assert moments[0]["kind"] == "intro"
    assert {m["kind"] for m in moments} <= {"intro", "dip", "spike"}
    for m in moments:
        assert 0 <= m["start"] < m["end"] <= fs.duration + 1e-6
