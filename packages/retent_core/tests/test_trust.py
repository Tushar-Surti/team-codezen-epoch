"""Confidence levels come from held-out evidence; explanations name real differences, not artefacts."""

from __future__ import annotations

import json

import numpy as np

from retent_core.trust import assess, explain, level_for


def _stats(videos, median, positive):
    return {"videos": videos, "median_spearman": median, "share_positive": positive, "peaks_found": 0.3}


def test_levels_follow_the_evidence():
    assert level_for(_stats(56, 0.31, 0.93)) == "high"
    assert level_for(_stats(150, 0.21, 0.83)) == "medium"
    assert level_for(_stats(13, 0.42, 0.92)) == "medium"  # strong but few test videos
    assert level_for(_stats(45, 0.15, 0.62)) == "low"


def _calibrated(tmp_path, model="lgbm-test"):
    (tmp_path / "confidence.json").write_text(json.dumps({
        "model": model, "overall": _stats(300, 0.25, 0.84),
        "groups": {"education/en": _stats(56, 0.31, 0.93), "tech/hi": _stats(45, 0.15, 0.62)},
    }))
    return tmp_path


def test_assess_uses_the_group_and_lowers_out_of_scope_inputs(tmp_path):
    d = _calibrated(tmp_path)
    c = assess(category="education", language="en", duration=600, timing="measured", model_version="lgbm-test", models_dir=d)
    assert c.level == "high" and c.evidence.videos == 56 and c.disclaimer is None and "93%" in c.evidence_text
    # A script (estimated timing) that runs 20 minutes: two steps down, with both reasons and a disclaimer.
    c = assess(category="education", language="en", duration=1200, timing="estimated", model_version="lgbm-test", models_dir=d)
    assert c.level == "low" and len(c.reasons) == 2 and c.disclaimer
    # Hinglish counts as the Hindi group, the weakest one here.
    c = assess(category="tech", language="hinglish", duration=600, timing="measured", model_version="lgbm-test", models_dir=d)
    assert c.level == "low" and c.evidence.group == "Tech · Hindi"


def test_assess_claims_nothing_without_evidence(tmp_path):
    d = _calibrated(tmp_path, model="older-model")
    assert assess(category="tech", language="en", duration=600, timing="measured", model_version="lgbm-new", models_dir=d) is None
    rules = assess(category="tech", language="en", duration=600, timing="measured", model_version="heuristic-v0", models_dir=d)
    assert rules.level == "low" and rules.disclaimer


def test_explain_finds_an_on_screen_spike_and_agrees_elsewhere():
    n, dur = 100, 600.0
    base = np.sin(np.linspace(0, 6, n))
    actual = base.copy()
    actual[60:63] += 6  # a spike YouTube shows...
    model = base.copy()
    model[60:63] -= 2  # ...that the model scores as dull
    wps = np.full(n, 2.5)
    wps[59:64] = 0.2  # with almost nothing said there
    lines = [(i * 6.0, f"line {i}") for i in range(n)]
    out = explain(model, actual, dur, lines, wps=wps)
    spike = [d for d in out["differences"] if d["kind"] == "missed_peak" and d["start"] <= 366 <= d["end"]]
    assert spike and "on screen" in spike[0]["reason"]
    for ag in out["agreements"]:
        assert all(ag["end"] <= d["start"] or ag["start"] >= d["end"] for d in out["differences"])


def test_identical_curves_are_a_strong_match_with_nothing_to_explain():
    v = np.sin(np.linspace(0, 9, 100))
    out = explain(v, v, 600.0, [(0.0, "hello")])
    assert out["verdict"]["level"] == "strong" and out["differences"] == []
