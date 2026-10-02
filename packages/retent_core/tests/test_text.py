from retent_core.contract import Language
from retent_core.text import (
    content_tokens, detect_language, estimate_seconds, fmt_time, merge_caption_segments, normalize, split_script,
)


def test_detect_language():
    assert detect_language("Today we compare three phones and pick the best camera.") == Language.en
    assert detect_language("आज हम तीन फ़ोन की तुलना करेंगे और सबसे अच्छा कैमरा चुनेंगे।") == Language.hi
    assert detect_language("Aaj hum teen phones ke baare mein baat karne wale hain, kaunsa best hai?") == Language.hinglish
    assert detect_language("") == Language.en
    # "the" and "to" are also romanized Hindi; plain English must not read as Hinglish.
    assert detect_language("Go to the store, then to the park, and the rest is up to the team.") == Language.en


def test_split_script_handles_punctuation_danda_and_newlines():
    out = split_script("First line. Second line!\nThird line\nयह चौथा है। यह पाँचवाँ है।")
    assert [r.text for r in out] == ["First line.", "Second line!", "Third line", "यह चौथा है।", "यह पाँचवाँ है।"]


def test_split_script_chunks_long_unpunctuated_runs():
    out = split_script(" ".join(["word"] * 70))
    assert [len(r.text.split()) for r in out] == [28, 28, 14]


def test_merge_caption_segments_breaks_on_pause():
    segs = [
        {"text": "so today we", "start": 0.0, "end": 1.0},
        {"text": "look at phones", "start": 1.0, "end": 2.0},
        {"text": "first the camera", "start": 3.5, "end": 4.5},
    ]
    out = merge_caption_segments(segs)
    assert [r.text for r in out] == ["so today we look at phones", "first the camera"]
    assert (out[0].start, out[0].end) == (0.0, 2.0)


def test_normalize_strips_caption_tags():
    assert normalize("[Music]  hello   there [applause]") == "hello there"


def test_content_tokens_drop_stopwords_and_fillers():
    assert content_tokens("So basically the camera is really good, matlab ekdum") == ["camera", "good", "ekdum"]


def test_estimate_seconds_scales_with_words():
    short = estimate_seconds("one two three", Language.en)
    long = estimate_seconds(" ".join(["word"] * 30), Language.en)
    assert 0 < short < long


def test_fmt_time():
    assert fmt_time(0) == "0:00"
    assert fmt_time(65.4) == "1:05"
    assert fmt_time(-3) == "0:00"
