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
  metrics: Record<"model" | "position" | "rules_v0" | "random", MethodMetrics>;
  series?: { actual: number[]; model: number[]; position: number[] };
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

/** Min-max to 0..1 so a relative-interest prediction and YouTube's curve share one scale. */
export function unit(v: number[]): number[] {
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return v.map((x) => (hi - lo ? (x - lo) / (hi - lo) : 0.5));
}
