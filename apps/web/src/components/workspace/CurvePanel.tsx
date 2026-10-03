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

const PAD_T = 18;
const PAD_B = 28;
const NOTE_W = 240;
const NOTE_H = 58;

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

  // The biggest drop (or the selected flag): a shaded span with a bracket, an end marker and a callout.
  const note = useMemo(() => {
    if (!focusFlag || width < 200) return null;
    const x1 = x(focusFlag.start);
    const x2 = Math.max(x1 + 6, x(Math.min(duration, Math.max(focusFlag.end, focusFlag.start + duration * 0.015))));
    const endT = Math.min(duration, focusFlag.end);
    const dotX = x(endT);
    const dotY = y(retentionAt(analysis.curve.bins, duration, endT).r);
    const plotMid = (PAD_T + y(0)) / 2;
    // Put the callout in the empty side of the curve: under it when the drop sits high, over it when low.
    const below = dotY < plotMid;
    const noteY = Math.max(PAD_T + 10, Math.min(y(0) - NOTE_H - 4, below ? dotY + 26 : dotY - 26 - NOTE_H));
    const right = dotX < width * 0.62;
    const noteX = right ? Math.min(width - PAD_R - NOTE_W, dotX + 24) : Math.max(PAD_L + 4, dotX - 24 - NOTE_W);
    const anchorX = right ? noteX : noteX + NOTE_W;
    const anchorY = below ? noteY : noteY + NOTE_H;
    return { x1, x2, dotX, dotY, noteX, noteY, anchorX, anchorY, flag: focusFlag };
  }, [focusFlag, x, y, width, analysis, duration]);

  // Motion: the bracket draws across the drop and the callout settles in; a revision morphs out of the White draft.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(".ann-bracket", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.55, ease: "power2.out", delay: 0.2 });
      gsap.fromTo(".ann-span", { opacity: 0 }, { opacity: 1, duration: 0.4, delay: 0.15 });
      gsap.fromTo(".ann-leader", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.35, ease: "power2.out", delay: 0.6 });
      gsap.fromTo(".ann-note", { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.4, delay: 0.7 });
    },
    { scope: svgRef, dependencies: [note?.flag.id, width > 0] },
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
    <figure className="relative h-full min-h-[140px]" aria-labelledby="curve-title">
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
            className="block touch-none rounded-chip select-none focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
            {/* Intro window (YouTube Studio's 0:30) */}
            <rect x={x(0)} y={PAD_T} width={Math.max(0, x(Math.min(30, duration)) - x(0))} height={y(0) - PAD_T} fill="var(--surface-2)" />
            <text x={x(0) + 6} y={y(0) - 7} className="tc fill-ink-3 text-[10.5px]">Intro</text>

            {/* Grid */}
            {[0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 3" />
                <text x={PAD_L - 10} y={y(v) + 3.5} textAnchor="end" className="tc fill-ink-3 text-[10.5px]">{v * 100}%</text>
              </g>
            ))}
            <line x1={PAD_L} x2={width - PAD_R} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />
            {minuteTicks(duration).map((t) => (
              <text key={t} x={x(t)} y={y(0) + 18} textAnchor="middle" className="tc fill-ink-3 text-[10.5px]">{fmtTime(t)}</text>
            ))}

            {/* Dips: a faint wash where the model expects excess exits */}
            {dips.map((d, i) => (
              <rect key={i} x={x(d.start)} y={PAD_T} width={Math.max(2, x(d.end) - x(d.start))} height={y(0) - PAD_T} fill="var(--drop-wash)" />
            ))}

            {/* Focused drop: shaded span and bracket */}
            {note && (
              <g aria-hidden>
                <rect className="ann-span" x={note.x1} y={PAD_T} width={note.x2 - note.x1} height={y(0) - PAD_T} fill="var(--drop-wash-strong)" />
                <path
                  className="ann-bracket"
                  d={`M${note.x1},${PAD_T + 6} V${PAD_T} H${note.x2} V${PAD_T + 6}`}
                  fill="none"
                  stroke="var(--drop)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </g>
            )}

            {/* Uncertainty band + White draft */}
            <path d={base.band} fill="var(--ink)" opacity={0.07} />
            <path d={base.line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={after ? 0.4 : 1} />

            {/* Revision draft */}
            {after && rev && (
              <path className="draft-line" d={after.line} fill="none" stroke={rev.ink} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Spikes: the stretches the model expects to hold attention best (never red) */}
            {spikes.map((m, i) => {
              const t = (m.start + m.end) / 2;
              // The drop callout owns its stretch of the curve; spikes inside it would collide with it.
              if (note && t >= note.flag.start - duration * 0.06 && t <= note.flag.end + duration * 0.06) return null;
              const cy = y(retentionAt(analysis.curve.bins, duration, t).r);
              // Neighbouring spikes share one label so the words never collide.
              const crowded = spikes.slice(0, i).some((o) => Math.abs(x((o.start + o.end) / 2) - x(t)) < 48);
              return (
                <g key={`spike-${i}`} transform={`translate(${x(t)},0)`} className="pointer-events-none" aria-hidden>
                  <path d={`M0,${cy - 8} l-4,-6 h8 z`} fill="var(--ink-2)" />
                  <circle cy={cy} r={3} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={1.5} />
                  {!crowded && <text y={cy - 19} textAnchor="middle" className="tc fill-ink-2 text-[10.5px]">Spike</text>}
                </g>
              );
            })}

            {/* Payoff marker */}
            {payoff != null && (
              <g transform={`translate(${x(payoff)},0)`}>
                <line y1={PAD_T} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                <text y={PAD_T + 11} x={5} className="tc fill-ink-2 text-[10.5px] font-[500]">Payoff {fmtTime(payoff)}</text>
              </g>
            )}

            {/* Focused drop: end marker, leader and callout */}
            {note && (
              <g>
                <line
                  className="ann-leader"
                  x1={note.dotX}
                  y1={note.dotY}
                  x2={note.anchorX}
                  y2={note.anchorY}
                  stroke="var(--drop)"
                  strokeWidth={1}
                  aria-hidden
                />
                <circle cx={note.dotX} cy={note.dotY} r={4.5} fill="var(--surface)" stroke="var(--drop)" strokeWidth={2} aria-hidden />
                <foreignObject className="ann-note" x={note.noteX} y={note.noteY} width={NOTE_W} height={NOTE_H + 16}>
                  <button
                    type="button"
                    onClick={() => selectFlag(note.flag.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="block w-full cursor-pointer rounded-control border border-drop/35 bg-surface px-2.5 py-1.5 text-left shadow-raised transition-colors duration-150 hover:border-drop/70"
                  >
                    <span className="line-clamp-2 block text-[13px] leading-[1.25] font-[600] text-drop-text">{note.flag.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
                      ≈ <span className="tnum font-[600] text-drop-text">{Math.round(note.flag.viewers_lost)}</span> of every 1,000 gone by{" "}
                      <span className="tc">{fmtTime(note.flag.end)}</span>
                    </span>
                  </button>
                </foreignObject>
              </g>
            )}

            {/* Playhead */}
            {(playhead > 0 || focused) && (
              <g transform={`translate(${x(Math.min(playhead, duration))},0)`} className="pointer-events-none">
                <line y1={PAD_T - 2} y2={y(0)} stroke="var(--accent)" strokeWidth={1.5} />
                <rect x={-4.5} y={PAD_T - 10} width={9} height={9} rx={2} fill="var(--accent)" />
              </g>
            )}

            {/* Crosshair */}
            {hover && probeTime != null && (
              <g className="pointer-events-none">
                <line x1={x(probeTime)} x2={x(probeTime)} y1={PAD_T} y2={y(0)} stroke="var(--ink)" strokeWidth={1} opacity={0.3} />
                <circle cx={x(probeTime)} cy={y(hover.r)} r={4.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
                {hoverAfter && rev && <circle cx={x(probeTime)} cy={y(hoverAfter.r)} r={4.5} fill={rev.ink} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            )}
          </svg>
        )}
        {hover && probeTime != null && width > 0 && (
          <div
            className="pointer-events-none absolute z-10 min-w-[168px] rounded-control border border-line bg-surface px-3 py-2 shadow-overlay"
            style={{ left: Math.min(width - 190, x(probeTime) + 12), top: 8 }}
          >
            <div className="tc text-[11.5px] text-ink-3">{fmtTime(probeTime)}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="inline-block h-[2px] w-3 translate-y-[-3px] bg-ink" />
              <span className="tnum text-[17px] font-[600] tracking-[-0.01em]">{pct(hover.r)}</span>
              <span className="text-[12px] text-ink-3">still watching</span>
            </div>
            <div className="tnum text-[11.5px] text-ink-3">likely {pct(hover.lo)}–{pct(hover.hi)}</div>
            {hoverAfter && rev && (
              <div className="mt-1 flex items-baseline gap-2">
                <span className="inline-block h-[2px] w-3 translate-y-[-3px]" style={{ background: rev.ink }} />
                <span className="tnum text-[17px] font-[600] tracking-[-0.01em]">{pct(hoverAfter.r)}</span>
                <span className="text-[12px] text-ink-3">{rev.name} draft</span>
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
