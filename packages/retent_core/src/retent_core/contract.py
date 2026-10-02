"""The Analysis contract: the one shape every part of Retent AI produces or consumes.

Pydantic models here are the source of truth. `contract_export` writes them to JSON Schema,
and the web app generates TypeScript types from that schema, so Python and TS never drift.

Conventions
- Times are seconds from the start of the video (float).
- Retention values are fractions in [0, 1] of viewers who started the video.
- "Per 1,000" values are viewer counts per 1,000 starters.
- The curve always has exactly 100 bins (YouTube's own elapsedVideoTimeRatio resolution).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from retent_core import SCHEMA_VERSION

N_BINS = 100
INTRO_SECONDS = 30.0


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True, json_schema_serialization_defaults_required=True)


# ── Enumerations ──────────────────────────────────────────────────────────────


class Language(StrEnum):
    en = "en"
    hi = "hi"
    hinglish = "hinglish"


class Category(StrEnum):
    tech = "tech"
    education = "education"
    vlog = "vlog"


class InputMode(StrEnum):
    script = "script"  # text only, timing estimated
    video = "video"  # uploaded media, timing measured by ASR
    url = "url"  # public YouTube video, captions fetched


class Provider(StrEnum):
    claude = "claude"
    groq = "groq"
    local = "local"  # on-device model (embeddings, faster-whisper)
    rules = "rules"  # deterministic code, no model


class Engine(StrEnum):
    deep = "deep"  # Claude
    fast = "fast"  # Groq
    auto = "auto"


class SegmentRole(StrEnum):
    hook = "hook"
    setup = "setup"
    content = "content"
    payoff = "payoff"
    tangent = "tangent"
    sponsor = "sponsor"
    cta = "cta"
    recap = "recap"
    outro = "outro"


class FlagKind(StrEnum):
    late_hook = "late_hook"
    promise_debt = "promise_debt"
    repetition = "repetition"
    tangent = "tangent"
    low_density = "low_density"
    monotony = "monotony"
    early_ask = "early_ask"
    premature_wrap = "premature_wrap"
    open_loop = "open_loop"
    complexity_spike = "complexity_spike"
    chapter_skip = "chapter_skip"


class EditOpKind(StrEnum):
    cut = "cut"
    trim = "trim"
    move = "move"
    insert = "insert"
    rewrite = "rewrite"
    interrupt = "interrupt"  # pattern interrupt: b-roll / punch-in / on-screen text
    rechapter = "rechapter"


class Stage(StrEnum):
    ingest = "ingest"
    transcribe = "transcribe"
    segment = "segment"
    read = "read"  # LLM semantic pass
    predict = "predict"
    explain = "explain"
    fix = "fix"


# ── Building blocks ───────────────────────────────────────────────────────────


class Provenance(_Model):
    """Who produced a piece of content. Shown as a badge on every AI-written output."""

    provider: Provider
    model: str
    prompt_version: str | None = None


class Sentence(_Model):
    id: str = Field(description='Stable id, e.g. "s0012".')
    start: float
    end: float
    text: str
    lang: Language
    timing: Literal["measured", "estimated"]
    role: SegmentRole | None = None
    section_id: str | None = None


class Section(_Model):
    id: str
    kind: Literal["topic", "chapter"]
    title: str
    start: float
    end: float


class CurveBin(_Model):
    index: int = Field(ge=0, lt=N_BINS)
    t: float = Field(description="Bin centre in seconds.")
    retention: float = Field(ge=0, le=1)
    lo: float = Field(ge=0, le=1, description="Lower edge of the uncertainty band.")
    hi: float = Field(ge=0, le=1, description="Upper edge of the uncertainty band.")
    interest: float = Field(description="Relative interest within this video (z-score).")
    hazard: float = Field(ge=0, le=1, description="Share of remaining viewers lost in this bin.")


class TypicalBin(_Model):
    index: int = Field(ge=0, lt=N_BINS)
    lo: float = Field(ge=0, le=1)
    hi: float = Field(ge=0, le=1)


class Curve(_Model):
    bins: list[CurveBin] = Field(min_length=N_BINS, max_length=N_BINS)
    typical: list[TypicalBin] | None = Field(
        default=None, description="Typical range for this category and length, when known."
    )
    calibration: Literal["calibrated", "uncalibrated"]
    calibration_n: int = Field(
        ge=0, description="Number of real absolute retention curves the level is calibrated on."
    )


class KeyMoment(_Model):
    kind: Literal["intro", "dip", "spike", "top"]
    start: float
    end: float
    magnitude: float = Field(description="Size of the dip/spike in retention points.")
    label: str


class Metrics(_Model):
    duration_seconds: float
    intro_retention: float = Field(ge=0, le=1, description="Share still watching at 0:30.")
    apv: float = Field(ge=0, le=1, description="Average percentage viewed.")
    avd_seconds: float = Field(description="Average view duration.")
    payoff_time: float | None = Field(default=None, description="When the title's main promise pays off.")
    payoff_sentence_id: str | None = Field(default=None, description="Sentence where the payoff lands.")
    viewers_at_payoff: float | None = Field(default=None, description="Per 1,000 starters.")
    key_moments: list[KeyMoment] = []


class Evidence(_Model):
    sentence_ids: list[str]
    quote: str
    start: float
    end: float
    related_sentence_ids: list[str] = Field(
        default=[], description="Second passage, e.g. the earlier text a repetition repeats."
    )
    related_quote: str | None = None
    related_start: float | None = None
    related_end: float | None = None


class Signal(_Model):
    """One family of model attributions (grouped SHAP values) behind a flag."""

    family: str = Field(description='Machine key, e.g. "repetition", "off_promise".')
    label: str = Field(description="Human label shown in the inspector.")
    share: float = Field(ge=0, le=1, description="Share of this flag's added risk.")
    value: str | None = Field(default=None, description='Measured value, e.g. "similarity 0.91".')


class Norm(_Model):
    """Category norm computed from the dataset, e.g. median hook time for Hindi tech reviews."""

    label: str
    value: str
    n: int = Field(ge=0, description="Videos the norm is computed from.")


class Flag(_Model):
    id: str
    kind: FlagKind
    title: str = Field(description='Sharp, specific headline: "Intro runs 0:45 before the hook".')
    detail: str
    start: float
    end: float
    severity: int = Field(ge=1, le=5, description="Fixed 5-step magnitude ramp.")
    viewers_lost: float = Field(ge=0, description="Estimated viewers lost per 1,000 starters.")
    confidence: float = Field(ge=0, le=1)
    evidence: Evidence
    signals: list[Signal] = []
    norm: Norm | None = None
    fix_ids: list[str] = []
    provenance: Provenance


class EditOp(_Model):
    op: EditOpKind
    sentence_ids: list[str] = Field(default=[], description="Sentences the op acts on.")
    after_sentence_id: str | None = Field(
        default=None, description='For "move"/"insert": place after this sentence ("" = at start).'
    )
    new_text: str | None = Field(default=None, description='For "insert"/"rewrite".')
    note: str | None = Field(default=None, description='For "interrupt": what to show on screen.')


class Delta(_Model):
    intro_retention: float = Field(description="Change in share at 0:30 (fraction points).")
    apv: float
    avd_seconds: float
    viewers_at_payoff: float | None = Field(default=None, description="Change per 1,000 starters.")
    runtime_seconds: float = Field(description="Change in total runtime.")
    watch_time_per_1000: float = Field(description="Change in total minutes watched per 1,000 starters.")


class Fix(_Model):
    id: str
    flag_id: str
    title: str
    rationale: str
    ops: list[EditOp]
    delta: Delta | None = Field(default=None, description="From re-simulation; null until simulated.")
    provenance: Provenance


class PromiseItem(_Model):
    id: str
    text: str
    source: Literal["title", "thumbnail"]
    first_touch: float | None = None
    paid_off: float | None = None
    status: Literal["paid", "late", "unpaid"]
    evidence_sentence_ids: list[str] = []


class OpenLoop(_Model):
    id: str
    opened_at: float
    closed_at: float | None = None
    open_text: str
    close_text: str | None = None
    status: Literal["closed", "unclosed", "instant"]


class Redundancy(_Model):
    size: int = Field(description="Matrix is size × size over equal time slices.")
    values: list[float] = Field(description="Row-major similarity values in [0, 1].")


class PacingLane(_Model):
    key: Literal["wpm", "info_rate", "filler_rate", "cut_rate", "loudness", "pitch_var", "face"]
    label: str
    unit: str
    values: list[float] = Field(min_length=N_BINS, max_length=N_BINS)


class VideoMeta(_Model):
    title: str
    candidate_titles: list[str] = []
    thumbnail_text: str | None = None
    category: Category
    language: Language
    input_mode: InputMode
    duration_seconds: float
    source_url: str | None = None
    channel: str | None = None


class ModelInfo(_Model):
    version: str = Field(description='e.g. "heuristic-v0" or "lgbm-2026.10.1".')
    trained_on: int = Field(ge=0, description="Videos the interest model was trained on.")
    eval_report: str | None = Field(default=None, description="Id of the evaluation report backing it.")


class Warning_(_Model):
    code: str
    message: str


class Analysis(_Model):
    schema_version: Literal["1"] = SCHEMA_VERSION
    id: str
    created_at: datetime
    status: Literal["complete", "partial", "failed"]
    synthetic: bool = Field(
        description="True for development fixtures; the UI must label these as synthetic."
    )
    engine: Engine
    meta: VideoMeta
    sentences: list[Sentence]
    sections: list[Section] = []
    curve: Curve
    metrics: Metrics
    flags: list[Flag] = []
    fixes: list[Fix] = []
    promises: list[PromiseItem] = []
    loops: list[OpenLoop] = []
    redundancy: Redundancy | None = None
    pacing: list[PacingLane] = []
    model: ModelInfo
    warnings: list[Warning_] = []


# ── API payloads ──────────────────────────────────────────────────────────────


class AnalyzeRequest(_Model):
    title: str
    category: Category
    script: str | None = Field(default=None, description="Script or transcript text (script mode).")
    source_url: str | None = Field(default=None, description="Public YouTube URL (url mode).")
    candidate_titles: list[str] = []
    thumbnail_text: str | None = None
    language: Language | None = Field(default=None, description="Auto-detected when null.")
    engine: Engine = Engine.auto


class SimulateRequest(_Model):
    analysis_id: str
    fix_ids: list[str]


class Simulation(_Model):
    analysis_id: str
    fix_ids: list[str]
    curve: Curve
    metrics: Metrics
    delta: Delta
    sentences: list[Sentence] = Field(description="Edited script with re-estimated timing.")


class StageEvent(_Model):
    """Server-sent progress event while an analysis runs."""

    job_id: str
    stage: Stage
    status: Literal["start", "progress", "done", "error"]
    message: str
    progress: Annotated[float, Field(ge=0, le=1)] = 0.0
    provenance: Provenance | None = None


class JobAccepted(_Model):
    job_id: str
    analysis_id: str


EXPORTED_MODELS: dict[str, type[BaseModel]] = {
    "Analysis": Analysis,
    "AnalyzeRequest": AnalyzeRequest,
    "SimulateRequest": SimulateRequest,
    "Simulation": Simulation,
    "StageEvent": StageEvent,
    "JobAccepted": JobAccepted,
}
