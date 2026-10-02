from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

# Tests pin the rules-only engine so results don't depend on whichever trained model is on disk.
os.environ["RETENT_MODELS_DIR"] = str(Path(__file__).resolve().parent / "_no_models")

from retent_core.contract import Category, InputMode, Language, VideoMeta
from retent_core.features import TimedSentence
from retent_core.pipeline import analyze_sentences, sentences_from_script

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="session")
def sample() -> dict:
    return json.loads((ROOT / "fixtures" / "samples" / "hinglish-tech-review.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def sample_sentences(sample) -> list[TimedSentence]:
    return sentences_from_script(sample["script"])


@pytest.fixture(scope="session")
def sample_meta(sample) -> VideoMeta:
    return VideoMeta(title=sample["title"], thumbnail_text=sample["thumbnail_text"], category=Category.tech,
                     language=Language.hinglish, input_mode=InputMode.script, duration_seconds=0)


@pytest.fixture(scope="session")
def sample_analysis(sample_sentences, sample_meta):
    return analyze_sentences(sample_sentences, sample_meta, analysis_id="test-sample")
