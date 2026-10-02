import pytest

from retent_core.contract import EditOp, EditOpKind, Language
from retent_core.features import TimedSentence
from retent_core.simulator import apply_ops


@pytest.fixture
def script() -> list[TimedSentence]:
    texts = ["Hey guys, welcome back.", "Today we test three phones.", "The camera is great.", "Subscribe for more."]
    out, t = [], 0.0
    for i, text in enumerate(texts):
        out.append(TimedSentence(f"s{i}", text, t, t + 2.0, Language.en))
        t += 2.5
    return out


def ids(sents):
    return [s.id for s in sents]


def test_cut(script):
    out = apply_ops(script, [EditOp(op=EditOpKind.cut, sentence_ids=["s0"])])
    assert ids(out) == ["s1", "s2", "s3"]
    assert out[0].start == 0.0


def test_move_to_start(script):
    out = apply_ops(script, [EditOp(op=EditOpKind.move, sentence_ids=["s1"], after_sentence_id="")])
    assert ids(out) == ["s1", "s0", "s2", "s3"]


def test_move_after(script):
    out = apply_ops(script, [EditOp(op=EditOpKind.move, sentence_ids=["s3"], after_sentence_id="s1")])
    assert ids(out) == ["s0", "s1", "s3", "s2"]


def test_insert(script):
    out = apply_ops(script, [EditOp(op=EditOpKind.insert, after_sentence_id="s0", new_text="By the end you'll know which wins.")])
    assert ids(out) == ["s0", "n001", "s1", "s2", "s3"]
    assert out[1].text == "By the end you'll know which wins."


def test_rewrite_with_and_without_text(script):
    out = apply_ops(script, [EditOp(op=EditOpKind.rewrite, sentence_ids=["s2"], new_text="The camera wins.")])
    assert out[2].text == "The camera wins."
    out = apply_ops(script, [EditOp(op=EditOpKind.rewrite, sentence_ids=["s3"])])
    assert "subscribe" not in out[3].text.lower()


def test_retimed_back_to_back(script):
    out = apply_ops(script, [EditOp(op=EditOpKind.cut, sentence_ids=["s1"])])
    for a, b in zip(out, out[1:]):
        assert b.start >= a.end
        assert b.start - a.end < 1.0


def test_unknown_ids_are_ignored(script):
    out = apply_ops(script, [EditOp(op=EditOpKind.cut, sentence_ids=["nope"])])
    assert ids(out) == ids(script)
