import { scaleLinear } from "d3-scale";

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
