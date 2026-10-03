import { API_URL } from "./api";
import type { JobAccepted } from "./contract.gen";

export type MomentKind = "intro" | "sponsor" | "ask" | "wrap" | "tease" | "reveal" | "slow" | "chapter";
export type Moment = { kind: MomentKind; start: number; end: number; text: string };

export type Pattern = {
  kind: MomentKind;
  label: string;
  verdict: "hurts" | "helps" | "mixed";
  strength: "clear" | "early";
  videos: number;
  moments: number;
  of_videos: number;
  effect_pts: number;
  ci_pts: [number, number] | null;
  consistency: number;
  per_video: { id: string; pts: number }[];
  typical_pts: number | null;
  typical_videos: number;
  offsets: number[];
  trace: (number | null)[];
  typical_trace: (number | null)[];
  examples: { id: string; start: number; text: string }[];
};

export type XRayVideo = {
  id: string;
  title: string;
  upload_date: string | null;
  views: number | null;
  duration: number;
  heat: number[];
  moments: Moment[] | null;
  fit: number | null;
  analysis_id: string | null;
  transcript: string | null;
  has_transcript: boolean;
};

export type Zone = { from_pct: number; to_pct: number; direction: "below" | "above"; size: number; common_moment: MomentKind | null };

export type XRayReport = {
  id: string;
  created_at: string;
  source: "dataset" | "youtube";
  channel: { channel: string; channel_id: string; url: string; avatar: string | null; followers: number | null };
  category: string;
  skipped: Record<string, number>;
  videos: XRayVideo[];
  patterns: Pattern[];
  shape: { channel: number[]; p25: number[]; p75: number[]; typical: number[]; zones: Zone[] };
  habits: { key: string; label: string; unit: string; channel: number | null; typical: number | null }[];
  model_fit: number | null;
  advice: { kind: MomentKind; text: string; evidence: string; effect_pts: number; keep?: boolean }[];
  baseline_videos: number;
  baseline_channels: number;
};

export type DatasetChannel = { channel_id: string; channel: string; category: string; videos: number; transcripts: number };
export type ReportSummary = { id: string; channel: string; channel_id: string; created_at: string; videos: number; hurts: number; source: string };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  return res.json() as Promise<T>;
}

export const xrayApi = {
  channels: () => fetch(`${API_URL}/api/xray/channels`).then((r) => json<DatasetChannel[]>(r)),
  reports: () => fetch(`${API_URL}/api/xray`).then((r) => json<ReportSummary[]>(r)),
  get: (id: string) => fetch(`${API_URL}/api/xray/${id}`).then((r) => json<XRayReport>(r)),
  start: (body: { channel: string; category?: string; limit?: number; live?: boolean }) =>
    fetch(`${API_URL}/api/xray`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<JobAccepted>(r)),
};

/** Short names for the strip and tooltips. */
export const KIND_SHORT: Record<MomentKind, string> = {
  intro: "Intro talk",
  sponsor: "Sponsor read",
  ask: "Subscribe ask",
  wrap: "Early wrap-up",
  tease: "Tease",
  reveal: "Reveal",
  slow: "Slow stretch",
  chapter: "Chapter start",
};

export function verdictColor(v: Pattern["verdict"] | undefined): string {
  return v === "hurts" ? "var(--pen)" : v === "helps" ? "var(--rev-green)" : "var(--ink-3)";
}
