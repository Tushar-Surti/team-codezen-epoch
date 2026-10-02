import { curveCatmullRom, line } from "d3-shape";

/** Deterministic pseudo-random from a string seed, so a mark redraws identically. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** A felt-tip circle: slightly wobbly, a little tilted, and overshooting where the pen started. */
export function penEllipse(cx: number, cy: number, rx: number, ry: number, seed: string): string {
  const r = rng(seed);
  const tilt = (r() - 0.5) * 0.12;
  const start = -Math.PI * (0.62 + r() * 0.2);
  const sweep = Math.PI * 2 + 0.42 + r() * 0.25;
  const n = 26;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = start + (sweep * i) / n;
    const wobble = 1 + Math.sin(t * 3 + r() * 6) * 0.035 + (i / n) * 0.06;
    const x = Math.cos(t) * rx * wobble;
    const y = Math.sin(t) * ry * wobble;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return line().curve(curveCatmullRom.alpha(0.6))(pts) ?? "";
}

/** A short hand-drawn leader from a note to its mark. */
export function penLeader(x1: number, y1: number, x2: number, y2: number, seed: string): string {
  const r = rng(seed);
  const mx = (x1 + x2) / 2 + (r() - 0.5) * 14;
  const my = (y1 + y2) / 2 + (r() - 0.5) * 10;
  return line().curve(curveCatmullRom.alpha(0.5))([
    [x1, y1],
    [mx, my],
    [x2, y2],
  ]) ?? "";
}

