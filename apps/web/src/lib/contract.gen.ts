/* Generated from packages/retent_core/schema/contract.schema.json. Do not edit; run pnpm contract. */

export type SchemaVersion = "1";
export type Id = string;
export type CreatedAt = string;
export type Status = "complete" | "partial" | "failed";
/**
 * True for development fixtures; the UI must label these as synthetic.
 */
export type Synthetic = boolean;
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Engine".
 */
export type Engine = "deep" | "fast" | "auto";
export type Title = string;
export type CandidateTitles = string[];
export type ThumbnailText = string | null;
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Category".
 */
export type Category = "tech" | "education" | "vlog";
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Language".
 */
export type Language = "en" | "hi" | "hinglish";
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "InputMode".
 */
export type InputMode = "script" | "video" | "url";
export type DurationSeconds = number;
export type SourceUrl = string | null;
export type Channel = string | null;
/**
 * Stable id, e.g. "s0012".
 */
export type Id1 = string;
export type Start = number;
export type End = number;
export type Text = string;
export type Timing = "measured" | "estimated";
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "SegmentRole".
 */
export type SegmentRole =
  "hook" | "greeting" | "setup" | "content" | "payoff" | "tangent" | "sponsor" | "cta" | "recap" | "outro" | "filler";
export type SectionId = string | null;
export type Sentences = Sentence[];
export type Id2 = string;
export type Kind = "topic" | "chapter";
export type Title1 = string;
export type Start1 = number;
export type End1 = number;
export type Sections = Section[];
/**
 * @minItems 100
 * @maxItems 100
 */
export type Bins = [
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin,
  CurveBin
];
export type Index = number;
/**
 * Bin centre in seconds.
 */
export type T = number;
export type Retention = number;
/**
 * Lower edge of the uncertainty band.
 */
export type Lo = number;
/**
 * Upper edge of the uncertainty band.
 */
export type Hi = number;
/**
 * Relative interest within this video (z-score).
 */
export type Interest = number;
/**
 * Share of remaining viewers lost in this bin.
 */
export type Hazard = number;
/**
 * Typical range for this category and length, when known.
 */
export type Typical = TypicalBin[] | null;
export type Index1 = number;
export type Lo1 = number;
export type Hi1 = number;
export type Calibration = "calibrated" | "uncalibrated";
/**
 * Number of real absolute retention curves the level is calibrated on.
 */
export type CalibrationN = number;
export type DurationSeconds1 = number;
/**
 * Share still watching at 0:30.
 */
export type IntroRetention = number;
/**
 * Average percentage viewed.
 */
export type Apv = number;
/**
 * Average view duration.
 */
export type AvdSeconds = number;
/**
 * When the title's main promise pays off.
 */
export type PayoffTime = number | null;
/**
 * Sentence where the payoff lands.
 */
export type PayoffSentenceId = string | null;
/**
 * Per 1,000 starters.
 */
export type ViewersAtPayoff = number | null;
export type Kind1 = "intro" | "dip" | "spike" | "top";
export type Start2 = number;
export type End2 = number;
/**
 * Size of the dip/spike in retention points.
 */
export type Magnitude = number;
export type Label = string;
export type KeyMoments = KeyMoment[];
export type Id3 = string;
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "FlagKind".
 */
export type FlagKind =
  | "late_hook"
  | "promise_debt"
  | "repetition"
  | "tangent"
  | "low_density"
  | "monotony"
  | "early_ask"
  | "premature_wrap"
  | "open_loop"
  | "complexity_spike"
  | "chapter_skip";
/**
 * Sharp, specific headline: "Intro runs 0:45 before the hook".
 */
export type Title2 = string;
export type Detail = string;
export type Start3 = number;
export type End3 = number;
/**
 * Fixed 5-step magnitude ramp.
 */
export type Severity = number;
/**
 * Estimated viewers lost per 1,000 starters.
 */
export type ViewersLost = number;
export type Confidence = number;
export type SentenceIds = string[];
export type Quote = string;
export type Start4 = number;
export type End4 = number;
/**
 * Second passage, e.g. the earlier text a repetition repeats.
 */
export type RelatedSentenceIds = string[];
export type RelatedQuote = string | null;
export type RelatedStart = number | null;
export type RelatedEnd = number | null;
/**
 * Machine key, e.g. "repetition", "off_promise".
 */
export type Family = string;
/**
 * Human label shown in the inspector.
 */
export type Label1 = string;
/**
 * Share of this flag's added risk.
 */
export type Share = number;
/**
 * Measured value, e.g. "similarity 0.91".
 */
export type Value = string | null;
export type Signals = Signal[];
export type Label2 = string;
export type Value1 = string;
/**
 * Videos the norm is computed from.
 */
export type N = number;
export type FixIds = string[];
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Provider".
 */
export type Provider = "claude" | "groq" | "local" | "rules";
export type Model = string;
export type PromptVersion = string | null;
export type Flags = Flag[];
export type Id4 = string;
export type FlagId = string;
export type Title3 = string;
export type Rationale = string;
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "EditOpKind".
 */
export type EditOpKind = "cut" | "trim" | "move" | "insert" | "rewrite" | "interrupt" | "rechapter";
/**
 * Sentences the op acts on.
 */
export type SentenceIds1 = string[];
/**
 * For "move"/"insert": place after this sentence ("" = at start).
 */
export type AfterSentenceId = string | null;
/**
 * For "insert"/"rewrite".
 */
export type NewText = string | null;
/**
 * For "interrupt": what to show on screen.
 */
export type Note = string | null;
export type Ops = EditOp[];
/**
 * Change in share at 0:30 (fraction points).
 */
export type IntroRetention1 = number;
export type Apv1 = number;
export type AvdSeconds1 = number;
/**
 * Change per 1,000 starters.
 */
export type ViewersAtPayoff1 = number | null;
/**
 * Change in total runtime.
 */
export type RuntimeSeconds = number;
/**
 * Change in total minutes watched per 1,000 starters.
 */
export type WatchTimePer1000 = number;
export type Fixes = Fix[];
export type Id5 = string;
export type Text1 = string;
export type Source = "title" | "thumbnail";
export type FirstTouch = number | null;
export type PaidOff = number | null;
export type Status1 = "paid" | "late" | "unpaid";
export type EvidenceSentenceIds = string[];
export type Promises = PromiseItem[];
export type Id6 = string;
export type OpenedAt = number;
export type ClosedAt = number | null;
export type OpenText = string;
export type CloseText = string | null;
export type Status2 = "closed" | "unclosed" | "instant";
export type Loops = OpenLoop[];
/**
 * Matrix is size × size over equal time slices.
 */
export type Size = number;
/**
 * Row-major similarity values in [0, 1].
 */
export type Values = number[];
export type Key = "wpm" | "info_rate" | "filler_rate" | "cut_rate" | "silence" | "loudness" | "pitch_var" | "face";
export type Label3 = string;
export type Unit = string;
/**
 * @minItems 100
 * @maxItems 100
 */
export type Values1 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];
export type Pacing = PacingLane[];
/**
 * e.g. "heuristic-v0" or "lgbm-2026.10.1".
 */
export type Version = string;
/**
 * Videos the interest model was trained on.
 */
export type TrainedOn = number;
/**
 * Id of the evaluation report backing it.
 */
export type EvalReport = string | null;
export type Level = "high" | "medium" | "low";
export type Summary = string;
/**
 * The evidence in one plain sentence.
 */
export type EvidenceText = string | null;
/**
 * What lowers (or limits) confidence for this input.
 */
export type Reasons = string[];
/**
 * The held-out videos this one is compared with, e.g. "Tech · Hindi".
 */
export type Group = string;
/**
 * Held-out videos in the group, all from channels the model never trained on.
 */
export type Videos = number;
/**
 * Median rank correlation with YouTube's Most replayed curve.
 */
export type MedianSpearman = number;
/**
 * Share of those videos where the predicted shape matched at all (ρ > 0).
 */
export type SharePositive = number;
/**
 * Mean share of the 10 most-replayed moments found, within ±1% of the video.
 */
export type PeaksFound = number;
/**
 * Shown prominently when confidence is low.
 */
export type Disclaimer = string | null;
export type Code = string;
export type Message = string;
export type Warnings = Warning_[];
export type Title4 = string;
/**
 * Script or transcript text (script mode).
 */
export type Script = string | null;
/**
 * Public YouTube URL (url mode).
 */
export type SourceUrl1 = string | null;
export type CandidateTitles1 = string[];
export type ThumbnailText1 = string | null;
export type Engine1 = "deep" | "fast" | "auto";
export type AnalysisId = string;
export type FixIds1 = string[];
export type AnalysisId1 = string;
export type FixIds2 = string[];
/**
 * Edited script with re-estimated timing.
 */
export type Sentences1 = Sentence[];
export type JobId = string;
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Stage".
 */
export type Stage = "ingest" | "transcribe" | "segment" | "read" | "predict" | "explain" | "fix";
export type Status3 = "start" | "progress" | "done" | "error";
export type Message1 = string;
export type Progress = number;
export type JobId1 = string;
export type AnalysisId2 = string;

export interface RetentAIContract {
  Analysis?: Analysis;
  AnalyzeRequest?: AnalyzeRequest;
  SimulateRequest?: SimulateRequest;
  Simulation?: Simulation;
  StageEvent?: StageEvent;
  JobAccepted?: JobAccepted;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Analysis".
 */
export interface Analysis {
  schema_version: SchemaVersion;
  id: Id;
  created_at: CreatedAt;
  status: Status;
  synthetic: Synthetic;
  engine: Engine;
  meta: VideoMeta;
  sentences: Sentences;
  sections: Sections;
  curve: Curve;
  metrics: Metrics;
  flags: Flags;
  fixes: Fixes;
  promises: Promises;
  loops: Loops;
  redundancy: Redundancy | null;
  pacing: Pacing;
  model: ModelInfo;
  /**
   * Absent on analyses made before confidence existed.
   */
  confidence: Confidence1 | null;
  warnings: Warnings;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "VideoMeta".
 */
export interface VideoMeta {
  title: Title;
  candidate_titles: CandidateTitles;
  thumbnail_text: ThumbnailText;
  category: Category;
  language: Language;
  input_mode: InputMode;
  duration_seconds: DurationSeconds;
  source_url: SourceUrl;
  channel: Channel;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Sentence".
 */
export interface Sentence {
  id: Id1;
  start: Start;
  end: End;
  text: Text;
  lang: Language;
  timing: Timing;
  role: SegmentRole | null;
  section_id: SectionId;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Section".
 */
export interface Section {
  id: Id2;
  kind: Kind;
  title: Title1;
  start: Start1;
  end: End1;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Curve".
 */
export interface Curve {
  bins: Bins;
  typical: Typical;
  calibration: Calibration;
  calibration_n: CalibrationN;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "CurveBin".
 */
export interface CurveBin {
  index: Index;
  t: T;
  retention: Retention;
  lo: Lo;
  hi: Hi;
  interest: Interest;
  hazard: Hazard;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "TypicalBin".
 */
export interface TypicalBin {
  index: Index1;
  lo: Lo1;
  hi: Hi1;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Metrics".
 */
export interface Metrics {
  duration_seconds: DurationSeconds1;
  intro_retention: IntroRetention;
  apv: Apv;
  avd_seconds: AvdSeconds;
  payoff_time: PayoffTime;
  payoff_sentence_id: PayoffSentenceId;
  viewers_at_payoff: ViewersAtPayoff;
  key_moments: KeyMoments;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "KeyMoment".
 */
export interface KeyMoment {
  kind: Kind1;
  start: Start2;
  end: End2;
  magnitude: Magnitude;
  label: Label;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Flag".
 */
export interface Flag {
  id: Id3;
  kind: FlagKind;
  title: Title2;
  detail: Detail;
  start: Start3;
  end: End3;
  severity: Severity;
  viewers_lost: ViewersLost;
  confidence: Confidence;
  evidence: Evidence;
  signals: Signals;
  norm: Norm | null;
  fix_ids: FixIds;
  provenance: Provenance;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Evidence".
 */
export interface Evidence {
  sentence_ids: SentenceIds;
  quote: Quote;
  start: Start4;
  end: End4;
  related_sentence_ids: RelatedSentenceIds;
  related_quote: RelatedQuote;
  related_start: RelatedStart;
  related_end: RelatedEnd;
}
/**
 * One family of model attributions (grouped SHAP values) behind a flag.
 *
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Signal".
 */
export interface Signal {
  family: Family;
  label: Label1;
  share: Share;
  value: Value;
}
/**
 * Category norm computed from the dataset, e.g. median hook time for Hindi tech reviews.
 *
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Norm".
 */
export interface Norm {
  label: Label2;
  value: Value1;
  n: N;
}
/**
 * Who produced a piece of content. Shown as a badge on every AI-written output.
 *
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Provenance".
 */
export interface Provenance {
  provider: Provider;
  model: Model;
  prompt_version: PromptVersion;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Fix".
 */
export interface Fix {
  id: Id4;
  flag_id: FlagId;
  title: Title3;
  rationale: Rationale;
  ops: Ops;
  /**
   * From re-simulation; null until simulated.
   */
  delta: Delta | null;
  provenance: Provenance;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "EditOp".
 */
export interface EditOp {
  op: EditOpKind;
  sentence_ids: SentenceIds1;
  after_sentence_id: AfterSentenceId;
  new_text: NewText;
  note: Note;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Delta".
 */
export interface Delta {
  intro_retention: IntroRetention1;
  apv: Apv1;
  avd_seconds: AvdSeconds1;
  viewers_at_payoff: ViewersAtPayoff1;
  runtime_seconds: RuntimeSeconds;
  watch_time_per_1000: WatchTimePer1000;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "PromiseItem".
 */
export interface PromiseItem {
  id: Id5;
  text: Text1;
  source: Source;
  first_touch: FirstTouch;
  paid_off: PaidOff;
  status: Status1;
  evidence_sentence_ids: EvidenceSentenceIds;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "OpenLoop".
 */
export interface OpenLoop {
  id: Id6;
  opened_at: OpenedAt;
  closed_at: ClosedAt;
  open_text: OpenText;
  close_text: CloseText;
  status: Status2;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Redundancy".
 */
export interface Redundancy {
  size: Size;
  values: Values;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "PacingLane".
 */
export interface PacingLane {
  key: Key;
  label: Label3;
  unit: Unit;
  values: Values1;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "ModelInfo".
 */
export interface ModelInfo {
  version: Version;
  trained_on: TrainedOn;
  eval_report: EvalReport;
}
/**
 * How much to trust the curve's shape, from held-out evidence (not the model grading itself).
 *
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Confidence".
 */
export interface Confidence1 {
  level: Level;
  summary: Summary;
  evidence_text: EvidenceText;
  reasons: Reasons;
  evidence: ConfidenceEvidence | null;
  disclaimer: Disclaimer;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "ConfidenceEvidence".
 */
export interface ConfidenceEvidence {
  group: Group;
  videos: Videos;
  median_spearman: MedianSpearman;
  share_positive: SharePositive;
  peaks_found: PeaksFound;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Warning_".
 */
export interface Warning_ {
  code: Code;
  message: Message;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "AnalyzeRequest".
 */
export interface AnalyzeRequest {
  title: Title4;
  category: Category;
  script: Script;
  source_url: SourceUrl1;
  candidate_titles: CandidateTitles1;
  thumbnail_text: ThumbnailText1;
  /**
   * Auto-detected when null.
   */
  language: Language | null;
  engine: Engine1;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "SimulateRequest".
 */
export interface SimulateRequest {
  analysis_id: AnalysisId;
  fix_ids: FixIds1;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "Simulation".
 */
export interface Simulation {
  analysis_id: AnalysisId1;
  fix_ids: FixIds2;
  curve: Curve;
  metrics: Metrics;
  delta: Delta;
  sentences: Sentences1;
}
/**
 * Server-sent progress event while an analysis runs.
 *
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "StageEvent".
 */
export interface StageEvent {
  job_id: JobId;
  stage: Stage;
  status: Status3;
  message: Message1;
  progress: Progress;
  provenance: Provenance | null;
}
/**
 * This interface was referenced by `RetentAIContract`'s JSON-Schema
 * via the `definition` "JobAccepted".
 */
export interface JobAccepted {
  job_id: JobId1;
  analysis_id: AnalysisId2;
}
