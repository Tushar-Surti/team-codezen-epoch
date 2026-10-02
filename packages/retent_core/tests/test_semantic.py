"""Semantic read + fix writing, with the LLM call stubbed (no network)."""

from __future__ import annotations

from retent_core import semantic as sem_mod
from retent_core.contract import EditOp, EditOpKind, Provenance, Provider
from retent_core.features import TimedSentence, build_features
from retent_core.simulator import edited_semantic

PROV = Provenance(provider=Provider.groq, model="stub", prompt_version="test")


def _sents() -> list[TimedSentence]:
    lines = [
        "Hello doston, kaise ho aap sab?",
        "Aaj hum dekhenge kaunsa phone best camera deta hai.",
        "Pehle specs dekhte hain.",
        "Market mein bahut traffic tha.",
        "Parking bhi nahi mili.",
        "Final verdict: Volt 12 sabse accha hai.",
    ]
    return [TimedSentence(f"s{i:04d}", t, i * 5.0, i * 5.0 + 4.5, "hinglish") for i, t in enumerate(lines)]


def test_read_script_maps_spans_and_drops_unknown_ids(monkeypatch):
    payload = {
        "spans": [{"from": "s0000", "to": "s0000", "role": "greeting"},
                  {"from": "s0003", "to": "s0004", "role": "tangent"},
                  {"from": "s9999", "to": "s9999", "role": "cta"}],
        "hook": {"sentence_id": "s0001", "strength": 0.7, "why": "states the question"},
        "promises": [{"text": "best camera", "source": "title", "first_touch": "s0001", "payoff": "s0005"},
                     {"text": "bogus", "source": "title", "first_touch": "s7777", "payoff": None}],
        "loops": [{"open": "s0001", "close": None, "what": "the winner"}],
        "sections": [{"start": "s0000", "title": "Intro"}, {"start": "s0005", "title": "Verdict"}],
    }
    monkeypatch.setattr(sem_mod, "complete_json", lambda **kw: (payload, PROV))
    sem = sem_mod.read_script(_sents(), "Best camera phone?", None, "tech")
    assert sem.roles["s0000"] == "greeting"
    assert sem.roles["s0003"] == sem.roles["s0004"] == "tangent"
    assert "s9999" not in sem.roles
    assert sem.hook_id == "s0001" and sem.roles["s0001"] == "hook"
    assert [p["text"] for p in sem.promises] == ["best camera"]
    assert sem.known_ids == {s.id for s in _sents()}


def test_semantic_labels_drive_cue_features(monkeypatch):
    sem = sem_mod.Semantic(roles={"s0001": "hook", "s0003": "tangent"}, hook_id="s0001",
                           known_ids={s.id for s in _sents()})
    fs = build_features(_sents(), "Best camera phone?", semantic=sem)
    assert fs.s("hook")[1] == 1.0 and fs.s("hook")[0] == 0.0
    assert fs.s("topic_sim")[3] <= 0.05


def test_edited_semantic_labels_new_opening_line_as_hook():
    sem = sem_mod.Semantic(roles={"s0004": "outro"}, known_ids={s.id for s in _sents()})
    ops = [EditOp(op=EditOpKind.insert, after_sentence_id="", new_text="Aaj ka winner surprise karega."),
           EditOp(op=EditOpKind.rewrite, sentence_ids=["s0004"], new_text="Par abhi asli test baaki hai.")]
    out = edited_semantic(sem, ops)
    assert out.roles["n001"] == "hook"
    assert "s0004" not in out.roles
    assert "n001" in out.known_ids


def test_sanitize_drops_invented_timing_promises():
    assert sem_mod._sanitize("Kaun jeetega? Main 15 seconds mein bataunga.") == "Kaun jeetega?"
    assert sem_mod._sanitize("By the end you'll know which wins.") == "By the end you'll know which wins."
