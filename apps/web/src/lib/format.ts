export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function pct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed change in percentage points, e.g. +9.4 pts. */
export function pts(delta: number, digits = 1): string {
  const v = delta * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)} pts`;
}

export function signed(n: number, digits = 0, unit = ""): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}${unit}`;
}

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

export const LANGUAGE_LABEL: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };
export const CATEGORY_LABEL: Record<string, string> = { tech: "Tech review", education: "Education", vlog: "Vlog" };
export const MODE_LABEL: Record<string, string> = { script: "Script", video: "Rough cut", url: "Published video" };
