import { API_URL } from "./api";

export type MethodMetrics = { spearman: number; peaks_found: number; dips_found: number };
export type Interval = { mean: number; lo: number; hi: number };

export type EvalVideo = {
  id: string;
  title: string;
  channel: string;
  cell: string;
  fold: number;
  duration: number;
  text_kind: string;
  metrics: Record<"model" | "position" | "rules_v0" | "random", MethodMetrics> & { llm?: MethodMetrics };
  series?: { actual: number[]; model: number[]; position: number[]; llm?: number[] };
  /** What the app would have said before the reveal: its group's held-out record, this video left out. */
  confidence?: BlindConfidence;
  explain?: Explanation;
};

export type ConfidenceLevel = "high" | "medium" | "low";

export type BlindConfidence = {
  level: ConfidenceLevel;
  group: string;
  videos: number;
  median_spearman: number;
  share_positive: number;
  peaks_found: number;
  evidence_text: string;
};

/** Why a prediction and YouTube's curve agree or differ (retent_core.trust.explain). */
export type Explanation = {
  spearman: number;
  verdict: { level: "strong" | "partial" | "weak" | "miss"; label: string; text: string };
  differences: { start: number; end: number; kind: "missed_peak" | "false_alarm"; title: string; said: string; reason: string }[];
  agreements: { start: number; end: number; said: string }[];
};

export type EvalSummary = {
  version: string;
  created_at: string;
  n_videos: number;
  n_channels: number;
  cells: Record<string, number>;
  summary: {
    overall: Record<string, Record<keyof MethodMetrics, Interval>>;
    by_cell: Record<string, { n: number } & Record<string, number>>;
    wins: Record<string, number>;
    llm_head_to_head?: {
      n: number;
      model_name: string;
      model_beats_llm: number;
    } & Record<"model" | "llm" | "position", Record<keyof MethodMetrics, Interval>>;
  };
  videos: EvalVideo[];
  top_features: string[];
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  return res.json() as Promise<T>;
}

export const evalApi = {
  summary: () => fetch(`${API_URL}/api/eval`).then((r) => json<EvalSummary>(r)),
  video: (id: string) => fetch(`${API_URL}/api/eval/videos/${id}`).then((r) => json<EvalVideo>(r)),
};

export const METHOD_LABEL: Record<string, string> = {
  model: "Retent AI model",
  position: "Position only",
  rules_v0: "Rules (v0)",
  random: "Random",
};

export const FEATURE_LABEL: Record<string, string> = {
  promise_sim: "Pays off the title's promise",
  wps: "Speaking pace",
  numeral_rate: "Concrete numbers",
  redundancy: "Repetition",
  topic_sim: "Stays on topic",
  novelty: "New information",
  filler_rate: "Filler words",
  you_rate: "Talks to the viewer",
  question: "Questions",
  hook: "Hooks",
  cta: "Like/subscribe asks",
  sponsor: "Sponsor reads",
  outro: "Wrap-up language",
  greeting: "Greetings",
  loop_open: "Curiosity loops",
  loop_close: "Loop payoffs",
  complexity: "Jargon",
  since_last_hook: "Time since the last hook",
};

export const CELL_LABEL: Record<string, string> = {
  "tech/en": "Tech · English",
  "tech/hi": "Tech · Hindi",
  "education/en": "Education · English",
  "education/hi": "Education · Hindi",
  "vlog/en": "Vlog · English",
  "vlog/hi": "Vlog · Hindi",
};

/** Scale a curve to 0..1 between its own 5th and 95th percentiles, so a prediction and YouTube's curve share
 *  one scale. Min-max would let a single extreme bin (usually the opening, where everyone starts watching)
 *  flatten the rest of the curve against the floor. Values past the percentiles are clipped to the edges. */
export function unit(v: number[]): number[] {
  const s = [...v].sort((a, b) => a - b);
  const at = (p: number) => s[Math.round(p * (s.length - 1))];
  const lo = at(0.05);
  const hi = at(0.95);
  return v.map((x) => (hi - lo ? Math.min(1, Math.max(0, 0.04 + (0.92 * (x - lo)) / (hi - lo))) : 0.5));
}
