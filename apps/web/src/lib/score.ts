/** Client-side scoring for a live blind check (same metrics as retent_ml.train). */

export function resampleHeat(points: { start_time: number; end_time: number; value: number }[], duration: number, n = 100): number[] {
  const xs = points.map((p) => (p.start_time + p.end_time) / 2);
  const ys = points.map((p) => p.value);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * duration;
    let k = xs.findIndex((x) => x >= t);
    if (k <= 0) out.push(ys[k === 0 ? 0 : ys.length - 1]);
    else {
      const f = (t - xs[k - 1]) / (xs[k] - xs[k - 1] || 1);
      out.push(ys[k - 1] + (ys[k] - ys[k - 1]) * f);
    }
  }
  return out;
}

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  idx.forEach(([, i], k) => (r[i] = k));
  return r;
}

export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b);
  const n = ra.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Share of the k most (or least) interesting bins found, within ±1 bin. */
export function overlap(pred: number[], actual: number[], k = 10, low = false): number {
  const order = (v: number[]) => v.map((x, i) => [x, i] as const).sort((a, b) => (low ? a[0] - b[0] : b[0] - a[0])).slice(0, k).map(([, i]) => i);
  const near = new Set(order(actual).flatMap((i) => [i - 1, i, i + 1]));
  return order(pred).filter((i) => near.has(i)).length / k;
}
