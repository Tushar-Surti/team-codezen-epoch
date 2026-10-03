"use client";

import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { motion } from "motion/react";
import { useState } from "react";

import { fmtTime, signed } from "@/lib/format";
import { useSize } from "@/lib/useSize";
import { KIND_SHORT, type Moment, type Pattern, type XRayReport, verdictColor } from "@/lib/xray";

const EASE = [0.16, 1, 0.3, 1] as const;

function offsetLabel(s: number): string {
  if (s === 0) return "0";
  return `${s > 0 ? "+" : "−"}${fmtTime(Math.abs(s))}`;
}

/** Interest around one kind of moment, every occurrence lined up at t = 0 (an event-aligned average). */
export function MomentChart({ p }: { p: Pattern }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 150;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const vals = [...p.trace, ...p.typical_trace].filter((v): v is number => v !== null);
  const m = Math.min(60, Math.max(8, Math.ceil(Math.max(...vals.map(Math.abs), 0) / 4) * 4));
  const x = scaleLinear().domain([-60, 90]).range([pad.l, Math.max(pad.l + 10, width - pad.r)]);
  const y = scaleLinear().domain([-m, m]).range([height - pad.b, pad.t]);
  const ln = line<[number, number | null]>()
    .defined(([, v]) => v !== null)
    .x(([o]) => x(o))
    .y(([, v]) => y(v as number))
    .curve(curveMonotoneX);
  const own = p.offsets.map((o, i) => [o, p.trace[i]] as [number, number | null]);
  const typical = p.offsets.map((o, i) => [o, p.typical_trace[i]] as [number, number | null]);
  const color = verdictColor(p.verdict);
  const zeroLabel = p.kind === "intro" ? "greeting ends" : "moment";
  const hi = hover !== null ? hover : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${p.label}: interest from one minute before to 90 seconds after, this channel against other channels`}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const o = x.invert(e.clientX - r.left);
            const idx = p.offsets.reduce((best, v, i) => (Math.abs(v - o) < Math.abs(p.offsets[best] - o) ? i : best), 0);
            setHover(idx);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {/* the window the effect is measured over */}
          <rect x={x(0)} y={pad.t} width={x(30) - x(0)} height={height - pad.t - pad.b} fill="var(--paper-sunk)" />
          {[-m, -m / 2, 0, m / 2, m].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--rule-strong)" : "var(--rule)"} />
              <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="tnum fill-ink-3 text-[10.5px]">
                {v === 0 ? "0" : signed(v)}
              </text>
            </g>
          ))}
          {[-60, -30, 0, 30, 60, 90].map((o) => (
            <text key={o} x={x(o)} y={height - 6} textAnchor={o === 90 ? "end" : "middle"} className="tnum fill-ink-3 text-[10.5px]">
              {o === 0 ? zeroLabel : offsetLabel(o)}
            </text>
          ))}
          <line x1={x(0)} x2={x(0)} y1={pad.t} y2={height - pad.b} stroke="var(--ink)" strokeWidth={1} />
          <path d={ln(typical) ?? ""} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 3" />
          <motion.path
            d={ln(own) ?? ""}
            fill="none"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: EASE }}
          />
          {hi !== null && (
            <g pointerEvents="none">
              <line x1={x(p.offsets[hi])} x2={x(p.offsets[hi])} y1={pad.t} y2={height - pad.b} stroke="var(--ink-3)" strokeDasharray="2 2" />
              {p.trace[hi] !== null && (
                <circle cx={x(p.offsets[hi])} cy={y(p.trace[hi] as number)} r={4} fill={color} stroke="var(--paper-raised)" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>
      )}
      {hi !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-[6px] border border-rule-strong bg-paper-raised px-2.5 py-1.5 text-[12px] shadow-[0_8px_20px_-12px_rgb(23_23_26/0.4)]"
          style={{ left: Math.min(Math.max(0, x(p.offsets[hi]) + 10), width - 170) }}
        >
          <p className="tnum font-[620]">{p.offsets[hi] === 0 ? zeroLabel : `${offsetLabel(p.offsets[hi])} from the ${zeroLabel}`}</p>
          <p className="tnum text-ink-2">
            This channel: <strong className="font-[620] text-ink">{p.trace[hi] === null ? "—" : `${signed(p.trace[hi] as number, 1)} pts`}</strong>
          </p>
          <p className="tnum text-ink-2">
            Other channels: {p.typical_trace[hi] === null ? "—" : `${signed(p.typical_trace[hi] as number, 1)} pts`}
          </p>
        </div>
      )}
    </div>
  );
}

/** The channel's average Most replayed shape against every other channel in the dataset. */
export function ShapeChart({ shape }: { shape: XRayReport["shape"] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 230;
  const pad = { l: 12, r: 12, t: 26, b: 24 };
  const all = [...shape.p25, ...shape.p75, ...shape.typical, ...shape.channel];
  const lo = Math.min(...all);
  const hiV = Math.max(...all);
  const x = scaleLinear().domain([0, 99]).range([pad.l, Math.max(pad.l + 10, width - pad.r)]);
  const y = scaleLinear().domain([lo - 0.1, hiV + 0.1]).range([height - pad.b, pad.t]);
  const ln = line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX);
  const band = area<number>()
    .x((_, i) => x(i))
    .y0((_, i) => y(shape.p25[i]))
    .y1((_, i) => y(shape.p75[i]))
    .curve(curveMonotoneX);
  const diff = hover !== null ? shape.channel[hover] - shape.typical[hover] : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="This channel's average interest across a video compared with other channels"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(99, Math.round(x.invert(e.clientX - r.left)))));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {shape.zones.map((z) => (
            <g key={`${z.from_pct}-${z.direction}`}>
              <rect
                x={x(z.from_pct)}
                y={pad.t}
                width={Math.max(2, x(z.to_pct) - x(z.from_pct))}
                height={height - pad.t - pad.b}
                fill={z.direction === "below" ? "var(--pen-wash-strong)" : "var(--rev-green-paper)"}
              />
              <text x={x(z.from_pct) + 4} y={pad.t - 8} className="fill-ink-2 text-[11px] font-[600]">
                {z.direction === "below" ? "Sags" : "Holds"} {z.from_pct}–{z.to_pct}%
              </text>
            </g>
          ))}
          {[0, 25, 50, 75, 100].map((f) => (
            <g key={f}>
              <line x1={x(f * 0.99)} x2={x(f * 0.99)} y1={pad.t} y2={height - pad.b} stroke="var(--rule)" />
              <text x={x(f * 0.99)} y={height - 6} textAnchor={f === 0 ? "start" : f === 100 ? "end" : "middle"} className="tnum fill-ink-3 text-[10.5px]">
                {f}%
              </text>
            </g>
          ))}
          <path d={band(shape.channel) ?? ""} fill="var(--ink)" opacity={0.08} />
          <path d={ln(shape.typical) ?? ""} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 3" />
          <motion.path
            d={ln(shape.channel) ?? ""}
            fill="none"
            stroke="var(--actual)"
            strokeWidth={2.4}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.3, ease: EASE }}
          />
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--ink-3)" strokeDasharray="2 2" />
              <circle cx={x(hover)} cy={y(shape.channel[hover])} r={4} fill="var(--actual)" stroke="var(--paper-raised)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-[6px] border border-rule-strong bg-paper-raised px-2.5 py-1.5 text-[12px] shadow-[0_8px_20px_-12px_rgb(23_23_26/0.4)]"
          style={{ left: Math.min(Math.max(0, x(hover) + 10), width - 190) }}
        >
          <p className="tnum font-[620]">{hover}% into the video</p>
          <p className="tnum text-ink-2">
            {Math.abs(diff) < 0.1 ? "About the same as other channels" : `${Math.abs(diff).toFixed(2)} SD ${diff < 0 ? "below" : "above"} other channels`}
          </p>
        </div>
      )}
    </div>
  );
}

/** One video's real curve with its moments marked underneath. */
export function VideoSpark({ heat, moments, duration, colorOf }: {
  heat: number[];
  moments: Moment[] | null;
  duration: number;
  colorOf: (k: Moment["kind"]) => string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 46;
  const x = scaleLinear().domain([0, 99]).range([0, Math.max(10, width)]);
  const max = Math.max(...heat, 1e-6);
  const y = scaleLinear().domain([0, max]).range([height - 12, 2]);
  const ar = area<number>().x((_, i) => x(i)).y0(height - 12).y1((v) => y(v)).curve(curveMonotoneX);
  const ln = line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX);
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} aria-hidden>
          <path d={ar(heat) ?? ""} fill="var(--actual)" opacity={0.12} />
          <path d={ln(heat) ?? ""} fill="none" stroke="var(--actual)" strokeWidth={1.5} />
          {(moments ?? []).map((m, i) => {
            const cx = (m.start / duration) * Math.max(10, width);
            return (
              <g key={i}>
                <title>{`${KIND_SHORT[m.kind]} at ${fmtTime(m.start)}: ${m.text}`}</title>
                <rect x={cx - 1} y={height - 10} width={Math.max(2, ((m.end - m.start) / duration) * width)} height={6} rx={1.5} fill={colorOf(m.kind)} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
