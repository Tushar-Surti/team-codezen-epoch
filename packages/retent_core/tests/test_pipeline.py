"""Golden run of the full pipeline on the Hinglish sample: shape, honesty labels and the demo's key flags."""

import json

from retent_core.contract import N_BINS, Analysis
from retent_core.pipeline import analyze_sentences, sentences_from_captions


def test_analysis_round_trips_through_the_contract(sample_analysis):
    again = Analysis.model_validate(json.loads(sample_analysis.model_dump_json()))
    assert again.id == "test-sample"
    assert len(again.curve.bins) == N_BINS


def test_honesty_labels(sample_analysis):
    a = sample_analysis
    assert a.curve.calibration == "uncalibrated"
    assert a.curve.calibration_n == 0
    assert any(w.code == "uncalibrated" for w in a.warnings)
    assert a.model.version == "heuristic-v0"
    assert all(f.provenance.provider == "rules" for f in a.flags)


def test_demo_flags(sample_analysis):
    kinds = [f.kind for f in sample_analysis.flags]
    assert kinds[0] == "late_hook", "the greeting-first intro is the biggest drop"
    for kind in ("promise_debt", "repetition", "early_ask", "premature_wrap"):
        assert kind in kinds
    assert [f.viewers_lost for f in sample_analysis.flags] == sorted((f.viewers_lost for f in sample_analysis.flags), reverse=True)


def test_flags_quote_the_script(sample_analysis):
    text = {s.id: s.text for s in sample_analysis.sentences}
    for f in sample_analysis.flags:
        assert f.evidence.sentence_ids
        assert all(i in text for i in f.evidence.sentence_ids)
        assert 1 <= f.severity <= 5


def test_every_fix_is_simulated(sample_analysis):
    flag_ids = {f.id for f in sample_analysis.flags}
    for fx in sample_analysis.fixes:
        assert fx.flag_id in flag_ids
        assert fx.delta is not None
    hook_fix = next(fx for fx in sample_analysis.fixes
                    if next(f for f in sample_analysis.flags if f.id == fx.flag_id).kind == "late_hook")
    assert hook_fix.delta.intro_retention > 0


def test_payoff_is_the_verdict(sample_analysis):
    a = sample_analysis
    payoff = next(s for s in a.sentences if s.id == a.metrics.payoff_sentence_id)
    assert "verdict" in payoff.text.lower()
    assert a.metrics.viewers_at_payoff is not None


def test_pacing_and_redundancy(sample_analysis):
    assert {p.key for p in sample_analysis.pacing} >= {"wpm", "info_rate", "filler_rate"}
    r = sample_analysis.redundancy
    assert r is not None and len(r.values) == r.size * r.size


def test_captions_path(sample_meta):
    segs = [{"text": f"line number {i} about the camera test", "start": i * 3.0, "end": i * 3.0 + 3.4}
            for i in range(120)]
    sents = sentences_from_captions(segs)
    for a, b in zip(sents, sents[1:]):
        assert a.end <= b.start + 1e-9
    a = analyze_sentences(sents, sample_meta, timing="measured")
    assert a.sentences[0].timing == "measured"
