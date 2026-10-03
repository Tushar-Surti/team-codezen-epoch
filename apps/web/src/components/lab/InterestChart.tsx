"use client";

import { useGSAP } from "@gsap/react";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { useId, useMemo, useRef } from "react";

import { fmtTime } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useSize } from "@/lib/useSize";
import { unit } from "@/lib/eval";

type Props = {
  model: number[];
  actual: number[];
  duration: number;
  /** Draw our prediction (animated the first time it turns on). */
  predicted?: boolean;
  /** Sweep YouTube's real curve in over the prediction. */
  revealed?: boolean;
  compact?: boolean;
  label?: string;
  /** Optional zero-shot LLM guess, drawn as a thin goldenrod line. */
  llm?: number[] | null;
};

const PAD = { l: 44, r: 16, t: 14, b: 26 };

/** Predicted relative interest (ink) against YouTube's "Most replayed" (violet), on one 0–1 scale. */
export function InterestChart({ model, actual, duration, predicted = true, revealed = true, compact = false, label, llm = null }: Props) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const clipId = useId().replace(/:/g, "");
  const m = useMemo(() => unit(model), [model]);
  const a = useMemo(() => unit(actual), [actual]);
  const g = useMemo(() => (llm ? unit(llm) : null), [llm]);

  const x = scaleLinear().domain([0, m.length - 1]).range([PAD.l, Math.max(PAD.l + 10, width - PAD.r)]);
  const y = scaleLinear().domain([0, 1]).range([Math.max(PAD.t + 10, height - PAD.b), PAD.t]);
  const ln = line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX);
  const ar = area<number>().x((_, i) => x(i)).y0(y(0)).y1((v) => y(v)).curve(curveMonotoneX);

  useGSAP(
    () => {
      if (!predicted || prefersReducedMotion()) return;
      gsap.fromTo(".pred-line", { drawSVG: "0%" }, { drawSVG: "100%", duration: compact ? 0.6 : 1.4, ease: "power2.inOut" });
    },
    { scope: svg, dependencies: [predicted, model, width > 0] },
  );
  useGSAP(
    () => {
      if (!revealed) return;
      const w = Math.max(0, width - PAD.l - PAD.r);
      if (prefersReducedMotion()) {
        gsap.set(`#${clipId}-rect`, { attr: { width: w } });
        return;
      }
      gsap.fromTo(`#${clipId}-rect`, { attr: { width: 0 } }, { attr: { width: w }, duration: compact ? 0.7 : 1.6, ease: "power3.inOut" });
    },
    { scope: svg, dependencies: [revealed, actual, width] },
  );

  const ticks = duration > 0 ? [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, t: f * duration })) : [];

  return (
    <div ref={ref} className="relative h-full w-full">
      {width > 0 && (
        <svg ref={svg} width={width} height={height} role="img" aria-label={label ?? "Predicted interest against YouTube's Most replayed curve"}>
          <defs>
            <clipPath id={clipId}>
              <rect id={`${clipId}-rect`} x={PAD.l} y={0} width={revealed ? 0 : 0} height={height} />
            </clipPath>
          </defs>
          {!compact &&
            [0, 0.5, 1].map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 3" />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="tc fill-ink-3 text-[10.5px]">
                  {v === 1 ? "High" : v === 0 ? "Low" : ""}
                </text>
              </g>
            ))}
          <line x1={PAD.l} x2={width - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
          {!compact &&
            ticks.map(({ f, t }) => (
              <text key={f} x={x(f * (m.length - 1))} y={y(0) + 18} textAnchor="middle" className="tc fill-ink-3 text-[10.5px]">
                {fmtTime(t)}
              </text>
            ))}

          {/* YouTube's real curve, swept in from the left */}
          <g clipPath={`url(#${clipId})`}>
            <path d={ar(a) ?? ""} fill="var(--actual)" opacity={0.12} />
            <path d={ln(a) ?? ""} fill="none" stroke="var(--actual)" strokeWidth={2} strokeLinejoin="round" />
          </g>

          {g && <path d={ln(g) ?? ""} fill="none" stroke="var(--rev-gold)" strokeWidth={1.8} strokeLinejoin="round" opacity={0.95} />}

          {/* Our blind prediction */}
          {predicted && (
            <path className="pred-line" d={ln(m) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={compact ? 1.6 : 2.2} strokeLinejoin="round" strokeLinecap="round" />
          )}
        </svg>
      )}
    </div>
  );
}
