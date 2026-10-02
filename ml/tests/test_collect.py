from retent_ml.collect import _pick_caption, spoken_language


def test_spoken_language_beats_metadata():
    # Hindi speech, uploader left the metadata language on English.
    info = {"language": "en", "automatic_captions": {"hi-orig": [], "en": [], "fr": []}, "subtitles": {"en": []}}
    assert spoken_language(info) == "hi"
    assert _pick_caption(info, "hi") == ("auto", "hi-orig")


def test_spoken_language_falls_back_to_metadata():
    assert spoken_language({"language": "en-US", "automatic_captions": {}}) == "en"
    assert spoken_language({}) == ""


def test_manual_captions_win_in_the_spoken_language():
    info = {"automatic_captions": {"en-orig": []}, "subtitles": {"en-GB": [], "hi": []}}
    assert _pick_caption(info, "en") == ("manual", "en-GB")
    assert _pick_caption(info, "fr") is None
