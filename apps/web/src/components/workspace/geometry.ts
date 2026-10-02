import { scaleLinear } from "d3-scale";

import type { Analysis, CurveBin } from "@/lib/contract.gen";

/** Every time-aligned view (curve, lanes) shares these insets so marks register on one axis. */
export const PAD_L = 52;
export const PAD_R = 24;

export function timeScale(width: number, duration: number) {
  return scaleLinear()
    .domain([0, Math.max(1, duration)])
    .range([PAD_L, Math.max(PAD_L + 10, width - PAD_R)]);
}

export function minuteTicks(duration: number): number[] {
  const step = duration > 720 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.1; t += step) ticks.push(t);
  return ticks;
}

/** Retention (and its likely range) at any time, linear between bin ends; the curve starts at 100%. */
export function retentionAt(bins: CurveBin[], duration: number, t: number): { r: number; lo: number; hi: number } {
  if (t <= 0) return { r: 1, lo: 1, hi: 1 };
  if (t >= duration) {
    const last = bins[bins.length - 1];
    return { r: last.retention, lo: last.lo, hi: last.hi };
  }
  const xs = [0, ...bins.map((_, i) => ((i + 1) / bins.length) * duration)];
  const pick = (key: "retention" | "lo" | "hi") => {
    const ys = [1, ...bins.map((b) => b[key])];
    const i = Math.min(xs.length - 2, Math.max(0, xs.findIndex((x) => x >= t) - 1));
    const f = (t - xs[i]) / (xs[i + 1] - xs[i] || 1);
    return ys[i] + (ys[i + 1] - ys[i]) * Math.min(1, Math.max(0, f));
  };
  return { r: pick("retention"), lo: pick("lo"), hi: pick("hi") };
}

/** Times worth jumping to with the keyboard: every flag start and every key moment, in order. */
export function jumpTargets(analysis: Analysis): { t: number; flagId: string | null }[] {
  const out = [
    ...analysis.flags.map((f) => ({ t: f.start, flagId: f.id as string | null })),
    ...analysis.metrics.key_moments.filter((m) => m.kind !== "intro").map((m) => ({ t: m.start, flagId: null })),
  ];
  return out.sort((a, b) => a.t - b.t);
}
