"use client";

import { useGSAP } from "@gsap/react";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { useMemo, useRef, useState } from "react";

import type { Analysis, CurveBin, Flag } from "@/lib/contract.gen";
import { fmtTime, pct } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { revision } from "@/lib/revisions";
import { useSize } from "@/lib/useSize";
import { useWorkspace } from "@/lib/workspace-store";

import { PAD_L, PAD_R, jumpTargets, minuteTicks, retentionAt, timeScale } from "./geometry";
import { penEllipse, penLeader } from "./penPath";

const PAD_T = 18;
const PAD_B = 28;

type Props = { analysis: Analysis; focusFlag: Flag | null };

export function CurvePanel({ analysis, focusFlag }: Props) {
  const [wrapRef, { width, height }] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const { playhead, setPlayhead, hoverTime, setHoverTime, drafts, activeDraft, selectFlag } = useWorkspace();
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  const duration = analysis.metrics.duration_seconds;
  const draft = drafts.find((d) => d.key === activeDraft && d.key !== "white");
  const sim = draft?.simulation ?? null;
  const rev = draft ? revision(draft.key) : null;

  const x = useMemo(() => timeScale(width, Math.max(duration, sim?.metrics.duration_seconds ?? 0)), [width, duration, sim]);
  const y = useMemo(() => scaleLinear().domain([0, 1]).range([Math.max(PAD_T + 10, height - PAD_B), PAD_T]), [height]);

  const pathsFor = (bins: CurveBin[], dur: number) => {
    const pts = bins.map((b, i) => ({ ...b, t: ((i + 1) / bins.length) * dur }));
    const withStart = [{ t: 0, retention: 1, lo: 1, hi: 1 }, ...pts];
    return {
      line: line<(typeof withStart)[number]>().x((d) => x(d.t)).y((d) => y(d.retention)).curve(curveMonotoneX)(withStart) ?? "",
      band:
        area<(typeof withStart)[number]>().x((d) => x(d.t)).y0((d) => y(d.lo)).y1((d) => y(d.hi)).curve(curveMonotoneX)(withStart) ?? "",
    };
  };
  const base = useMemo(() => pathsFor(analysis.curve.bins, duration), [analysis, duration, x, y]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => (sim ? pathsFor(sim.curve.bins, sim.metrics.duration_seconds) : null), [sim, x, y]); // eslint-disable-line react-hooks/exhaustive-deps

  // Biggest drop (or the selected flag) gets the script doctor's red-pen circle.
  const pen = useMemo(() => {
    if (!focusFlag || width < 200) return null;
    const x1 = x(focusFlag.start), x2 = x(Math.max(focusFlag.end, focusFlag.start + duration * 0.02));
    const a = retentionAt(analysis.curve.bins, duration, focusFlag.start).r;
    const b = retentionAt(analysis.curve.bins, duration, focusFlag.end).r;
    let cx = (x1 + x2) / 2;
    const cy = (y(a) + y(b)) / 2;
    const rx = Math.max(22, (x2 - x1) / 2 + 14);
    // Keep the ellipse inside the plot vertically too (long spans would otherwise run off the top).
    const ry = Math.min(Math.max(18, Math.abs(y(a) - y(b)) / 2 + 16), cy - PAD_T + 2, y(0) - cy - 2);
    // Keep the felt-tip inside the plot so it never scribbles over the axis labels.
    cx = Math.max(PAD_L + rx + 6, Math.min(width - PAD_R - rx - 4, cx));
    const noteRight = cx < width * 0.62;
    const noteX = noteRight ? Math.min(width - PAD_R - 250, cx + rx + 28) : Math.max(PAD_L + 8, cx - rx - 278);
    const noteY = Math.max(PAD_T + 2, Math.min(cy - ry - 8, (height - PAD_B) * 0.55));
    return {
      ellipse: penEllipse(cx, cy, rx, ry, focusFlag.id),
      leader: penLeader(noteRight ? noteX - 4 : noteX + 252, noteY + 18, noteRight ? cx + rx * 0.7 : cx - rx * 0.7, cy - ry * 0.5, focusFlag.id + "l"),
      noteX, noteY, flag: focusFlag,
    };
  }, [focusFlag, x, y, width, height, analysis, duration]);

  // Signature motion: the pen circles the drop; the revision curve morphs out of the White draft.
  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      if (!reduce) {
        gsap.fromTo(".pen-ellipse", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.9, ease: "power2.inOut", delay: 0.35 });
        gsap.fromTo(".pen-leader", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.4, ease: "power2.out", delay: 1.15 });
        gsap.fromTo(".pen-note", { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.5, delay: 1.25 });
      }
    },
    { scope: svgRef, dependencies: [pen?.flag.id, width > 0] },
  );
  useGSAP(
    () => {
      if (!after || prefersReducedMotion()) return;
      gsap.fromTo(".draft-line", { morphSVG: base.line }, { morphSVG: after.line, duration: 0.9, ease: "expo.out" });
      gsap.fromTo(".draft-line", { opacity: 0.2 }, { opacity: 1, duration: 0.4 });
    },
    { scope: svgRef, dependencies: [after?.line] },
  );

  const toTime = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, x.invert(clientX - rect.left)));
  };
  // Keyboard: the curve is a slider for the playhead. Arrows step one bin (Shift: ten),
  // [ and ] jump between drops and key moments, Esc clears the selected drop.
  const targets = useMemo(() => jumpTargets(analysis), [analysis]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = (duration / 100) * (e.shiftKey ? 10 : 1);
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = playhead + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = playhead - step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = duration;
    else if (e.key === "]" || e.key === "PageDown" || e.key === "[" || e.key === "PageUp") {
      const fwd = e.key === "]" || e.key === "PageDown";
      const hit = fwd ? targets.find((m) => m.t > playhead + 0.5) : [...targets].reverse().find((m) => m.t < playhead - 0.5);
      if (hit) {
        next = hit.t;
        selectFlag(hit.flagId);
      }
    } else if (e.key === "Escape") selectFlag(null);
    else return;
    e.preventDefault();
    if (next != null) setPlayhead(Math.min(duration, Math.max(0, next)));
  };

  // The readout follows the pointer, or the playhead while the curve has keyboard focus.
  const probeTime = hoverTime ?? (focused ? playhead : null);
  const hover = probeTime != null ? retentionAt(analysis.curve.bins, duration, probeTime) : null;
  const hoverAfter = probeTime != null && sim ? retentionAt(sim.curve.bins, sim.metrics.duration_seconds, probeTime) : null;
  const atPlayhead = retentionAt(analysis.curve.bins, duration, playhead);
  const dips = analysis.metrics.key_moments.filter((m) => m.kind === "dip");
  const spikes = analysis.metrics.key_moments.filter((m) => m.kind === "spike");
  const payoff = analysis.metrics.payoff_time;

  return (
    <figure className="relative h-full min-h-[240px]" aria-labelledby="curve-title">
      <figcaption className="sr-only" id="curve-title">
        Predicted retention: {pct(analysis.metrics.intro_retention)} still watching at 0:30, average {pct(analysis.metrics.apv)} viewed.
        The full curve is also available as a table below the chart.
      </figcaption>
      <div ref={wrapRef} className="absolute inset-0">
        {width > 0 && (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="slider"
            tabIndex={0}
            aria-label="Playhead on the predicted retention curve. Arrow keys move, [ and ] jump between drops."
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(playhead)}
            aria-valuetext={`${fmtTime(playhead)}, ${pct(atPlayhead.r)} still watching`}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="block touch-none rounded-[4px] select-none focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            onPointerMove={(e) => {
              const t = toTime(e.clientX);
              setHoverTime(t);
              if (dragging) setPlayhead(t);
            }}
            onPointerLeave={() => setHoverTime(null)}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragging(true);
              setPlayhead(toTime(e.clientX));
            }}
            onPointerUp={() => setDragging(false)}
          >
            {/* Intro window */}
            <rect x={x(0)} y={PAD_T} width={Math.max(0, x(Math.min(30, duration)) - x(0))} height={y(0) - PAD_T} fill="var(--paper-sunk)" />
            <text x={x(0) + 6} y={y(0) - 8} className="fill-ink-3 text-[11px]">Intro</text>

            {/* Grid */}
            {[0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={1} />
                <text x={PAD_L - 10} y={y(v) + 4} textAnchor="end" className="tnum fill-ink-3 text-[11px]">{v * 100}%</text>
              </g>
            ))}
            <line x1={PAD_L} x2={width - PAD_R} y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" strokeWidth={1} />
            {minuteTicks(duration).map((t) => (
              <text key={t} x={x(t)} y={y(0) + 18} textAnchor="middle" className="tnum fill-ink-3 text-[11px]">{fmtTime(t)}</text>
            ))}

            {/* Dips: a faint red wash under the curve where the model expects excess exits */}
            {dips.map((d, i) => (
              <rect key={i} x={x(d.start)} y={PAD_T} width={Math.max(2, x(d.end) - x(d.start))} height={y(0) - PAD_T} fill="var(--pen-wash)" />
            ))}

            {/* Uncertainty band + White draft */}
            <path d={base.band} fill="var(--ink)" opacity={0.055} />
            <path d={base.line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={after ? 0.45 : 1} />

            {/* Revision draft */}
            {after && rev && (
              <path className="draft-line" d={after.line} fill="none" stroke={rev.ink} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Key moments: spikes, the stretches the model expects to hold attention best (ink, never red) */}
            {spikes.map((m, i) => {
              const t = (m.start + m.end) / 2;
              const cy = y(retentionAt(analysis.curve.bins, duration, t).r);
              // Neighbouring spikes share one label so the words never collide.
              const crowded = spikes.slice(0, i).some((o) => Math.abs(x((o.start + o.end) / 2) - x(t)) < 48);
              return (
                <g key={`spike-${i}`} transform={`translate(${x(t)},0)`} className="pointer-events-none" aria-hidden>
                  <line y1={cy - 5} y2={cy - 19} stroke="var(--ink-2)" strokeWidth={1} />
                  <path d={`M0,${cy - 27} l4.5,7 h-9 z`} fill="var(--ink-2)" />
                  <circle cy={cy} r={3} fill="var(--paper)" stroke="var(--ink-2)" strokeWidth={1.5} />
                  {!crowded && <text y={cy - 31} textAnchor="middle" className="fill-ink-2 text-[11px] font-[550]">Spike</text>}
                </g>
              );
            })}

            {/* Payoff marker */}
            {payoff != null && (
              <g transform={`translate(${x(payoff)},0)`}>
                <line y1={PAD_T} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="0" opacity={0.35} />
                <text y={PAD_T + 10} x={5} className="fill-ink-2 text-[11px] font-[550]">Payoff {fmtTime(payoff)}</text>
              </g>
            )}

            {/* Red pen: biggest drop */}
            {pen && (
              <g aria-hidden>
                <path className="pen-ellipse" d={pen.ellipse} fill="none" stroke="var(--pen)" strokeWidth={2.4} strokeLinecap="round" />
                <path className="pen-leader" d={pen.leader} fill="none" stroke="var(--pen)" strokeWidth={1.6} strokeLinecap="round" />
                <foreignObject className="pen-note" x={pen.noteX} y={pen.noteY} width={250} height={84}>
                  <button
                    type="button"
                    onClick={() => selectFlag(pen.flag.id)}
                    className="block w-full cursor-pointer rounded-[5px] bg-paper/90 px-1 text-left text-pen-text"
                  >
                    <span className="block text-[15px] leading-[1.15] font-[620] wdth-condensed">{pen.flag.title}</span>
                    <span className="mt-1 block text-[12.5px] leading-snug text-ink-2">
                      ≈ <span className="tnum font-[620] text-pen-text">{Math.round(pen.flag.viewers_lost)}</span> of every 1,000 viewers gone by {fmtTime(pen.flag.end)}
                    </span>
                  </button>
                </foreignObject>
              </g>
            )}

            {/* Playhead: a brass brad on a hairline */}
            {(playhead > 0 || focused) && (
              <g transform={`translate(${x(Math.min(playhead, duration))},0)`} className="pointer-events-none">
                <line y1={PAD_T - 4} y2={y(0)} stroke="var(--brass)" strokeWidth={1.5} />
                <circle cy={PAD_T - 6} r={5} fill="var(--brass)" stroke="var(--paper)" strokeWidth={2} />
              </g>
            )}

            {/* Crosshair + readout */}
            {hover && probeTime != null && (
              <g className="pointer-events-none">
                <line x1={x(probeTime)} x2={x(probeTime)} y1={PAD_T} y2={y(0)} stroke="var(--ink)" strokeWidth={1} opacity={0.35} />
                <circle cx={x(probeTime)} cy={y(hover.r)} r={4.5} fill="var(--ink)" stroke="var(--paper)" strokeWidth={2} />
                {hoverAfter && rev && <circle cx={x(probeTime)} cy={y(hoverAfter.r)} r={4.5} fill={rev.ink} stroke="var(--paper)" strokeWidth={2} />}
              </g>
            )}
          </svg>
        )}
        {hover && probeTime != null && width > 0 && (
          <div
            className="pointer-events-none absolute z-10 min-w-[168px] rounded-[7px] border border-rule bg-paper-raised px-3 py-2 shadow-[0_6px_20px_-6px_rgb(23_23_26/0.25)]"
            style={{ left: Math.min(width - 190, x(probeTime) + 12), top: 8 }}
          >
            <div className="tnum text-[12px] text-ink-3">{fmtTime(probeTime)}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="inline-block h-[2px] w-3 translate-y-[-3px] bg-ink" />
              <span className="tnum text-[17px] font-[640]">{pct(hover.r)}</span>
              <span className="text-[12px] text-ink-3">still watching</span>
            </div>
            <div className="tnum text-[11.5px] text-ink-3">likely {pct(hover.lo)}–{pct(hover.hi)}</div>
            {hoverAfter && rev && (
              <div className="mt-1 flex items-baseline gap-2">
                <span className="inline-block h-[2px] w-3 translate-y-[-3px]" style={{ background: rev.ink }} />
                <span className="tnum text-[17px] font-[640]">{pct(hoverAfter.r)}</span>
                <span className="text-[12px] text-ink-3">{rev.name} draft</span>
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
