"use client";

import { useGSAP } from "@gsap/react";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useMemo, useRef } from "react";

import type { Analysis, Simulation } from "@/lib/contract.gen";
import { fmtTime, pct } from "@/lib/format";
import { ScrollTrigger, gsap, prefersReducedMotion } from "@/lib/gsap";
import { penEllipse } from "@/components/workspace/penPath";

const W = 720;
const H = 380;
const PAD = { l: 48, r: 20, t: 24, b: 34 };

type Props = { analysis: Analysis; sim: Simulation | null };

const STEPS = [
  {
    title: "Predict the curve",
    body: "Paste the script you're about to shoot. Retent AI predicts the retention curve before a single frame exists, in English, Hindi or Hinglish.",
  },
  {
    title: "Circle the drop",
    body: "The script doctor's red pen marks where viewers leave, with the lines that cause it and how many of every 1,000 viewers it costs.",
  },
  {
    title: "Fix it, and see the gain",
    body: "Each fix is written in your voice and re-simulated. Apply it and the Blue revision shows exactly how many more viewers reach your payoff.",
  },
];

/** Pinned scroll story driven by the real sample analysis: draw → circle → revise. */
export function ScrollStory({ analysis, sim }: Props) {
  const root = useRef<HTMLElement>(null);
  const dur = analysis.metrics.duration_seconds;
  const flag = analysis.flags[0];

  const geo = useMemo(() => {
    const maxDur = Math.max(dur, sim?.metrics.duration_seconds ?? 0);
    const x = scaleLinear().domain([0, maxDur]).range([PAD.l, W - PAD.r]);
    const y = scaleLinear().domain([0, 1]).range([H - PAD.b, PAD.t]);
    const path = (bins: { retention: number }[], d: number) =>
      line<[number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).curve(curveMonotoneX)([
        [0, 1],
        ...bins.map((b, i) => [((i + 1) / bins.length) * d, b.retention] as [number, number]),
      ]) ?? "";
    const white = path(analysis.curve.bins, dur);
    const blue = sim ? path(sim.curve.bins, sim.metrics.duration_seconds) : white;
    let ellipse = "";
    let note = { x: 0, y: 0 };
    if (flag) {
      const x1 = x(flag.start), x2 = x(Math.max(flag.end, flag.start + dur * 0.03));
      const at = (t: number) => {
        const i = Math.min(analysis.curve.bins.length - 1, Math.max(0, Math.floor((t / dur) * analysis.curve.bins.length)));
        return analysis.curve.bins[i].retention;
      };
      const cy = (y(at(flag.start)) + y(at(flag.end))) / 2;
      const rx = Math.max(30, (x2 - x1) / 2 + 18);
      const cx = Math.max(PAD.l + rx + 4, (x1 + x2) / 2);
      const ry = Math.min(60, Math.max(26, Math.abs(y(at(flag.start)) - y(at(flag.end))) / 2 + 22));
      ellipse = penEllipse(cx, cy, rx, ry, flag.id);
      note = { x: cx + rx + 16, y: Math.max(PAD.t + 4, cy - ry - 4) };
    }
    return { x, y, white, blue, ellipse, note, maxDur };
  }, [analysis, sim, dur, flag]);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set(".story-step", { autoAlpha: 1 });
        return;
      }
      gsap.set(".story-white", { drawSVG: "0%" });
      gsap.set([".story-pen", ".story-blue"], { drawSVG: "0%" });
      gsap.set([".story-note", ".story-delta"], { autoAlpha: 0, y: 8 });
      gsap.set(".story-step", { autoAlpha: 0.25 });
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.6 },
        defaults: { ease: "none" },
      });
      tl.to(".story-step-0", { autoAlpha: 1, duration: 0.2 }, 0)
        .to(".story-white", { drawSVG: "100%", duration: 1 }, 0)
        .to(".story-step-0", { autoAlpha: 0.25, duration: 0.2 }, 1.1)
        .to(".story-step-1", { autoAlpha: 1, duration: 0.2 }, 1.1)
        .to(".story-pen", { drawSVG: "100%", duration: 0.7, ease: "power1.inOut" }, 1.15)
        .to(".story-note", { autoAlpha: 1, y: 0, duration: 0.3 }, 1.7)
        .to(".story-step-1", { autoAlpha: 0.25, duration: 0.2 }, 2.2)
        .to(".story-step-2", { autoAlpha: 1, duration: 0.2 }, 2.2)
        .to(".story-white", { opacity: 0.35, duration: 0.3 }, 2.2)
        .to(".story-blue", { drawSVG: "100%", duration: 0.9 }, 2.25)
        .to(".story-delta", { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.1 }, 2.7);
      return () => ScrollTrigger.getAll().forEach((t) => t.trigger === root.current && t.kill());
    },
    { scope: root, dependencies: [geo.white, geo.blue] },
  );

  const gains = sim
    ? [
        { label: "Intro retention", value: `${pct(analysis.metrics.intro_retention)} → ${pct(sim.metrics.intro_retention)}` },
        {
          label: "Viewers at the payoff",
          value:
            sim.delta.viewers_at_payoff != null
              ? `+${Math.round(sim.delta.viewers_at_payoff)} per 1,000`
              : `${sim.delta.avd_seconds >= 0 ? "+" : ""}${Math.round(sim.delta.avd_seconds)}s AVD`,
        },
        { label: "Average view duration", value: `${fmtTime(analysis.metrics.avd_seconds)} → ${fmtTime(sim.metrics.avd_seconds)}` },
      ]
    : [];

  return (
    <section ref={root} className="relative h-[320vh]" aria-label="How Retent AI works">
      <div className="sticky top-14 flex h-[calc(100dvh-56px)] items-center">
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-10 px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:px-10">
          <ol className="space-y-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className={`story-step story-step-${i}`}>
                <h3 className="text-[26px] leading-tight font-[650] wdth-wide">
                  <span className="tnum mr-3 text-ink-3">{i + 1}</span>
                  {s.title}
                </h3>
                <p className="mt-2 max-w-[46ch] text-[16px] leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>

          <figure className="rounded-[4px] border border-rule bg-paper-raised p-4 shadow-[0_24px_60px_-30px_rgb(23_23_26/0.35)]">
            <figcaption className="flex items-baseline justify-between px-1 pb-2 text-[12.5px] text-ink-3">
              <span className="truncate pr-3 font-[560] text-ink-2">{analysis.meta.title}</span>
              <span className="shrink-0">Sample script</span>
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Predicted retention, the biggest drop, and the revised curve">
              {[0.25, 0.5, 0.75, 1].map((v) => (
                <g key={v}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--rule)" />
                  <text x={PAD.l - 8} y={geo.y(v) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">{v * 100}%</text>
                </g>
              ))}
              <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(0)} y2={geo.y(0)} stroke="var(--rule-strong)" />
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <text key={f} x={geo.x(f * geo.maxDur)} y={geo.y(0) + 20} textAnchor="middle" className="tnum fill-ink-3 text-[11px]">
                  {fmtTime(f * geo.maxDur)}
                </text>
              ))}
              <path className="story-white" d={geo.white} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round" />
              <path className="story-blue" d={geo.blue} fill="none" stroke="var(--rev-blue)" strokeWidth={2.8} strokeLinecap="round" />
              {geo.ellipse && <path className="story-pen" d={geo.ellipse} fill="none" stroke="var(--pen)" strokeWidth={2.6} strokeLinecap="round" />}
              {flag && (
                <foreignObject className="story-note" x={geo.note.x} y={geo.note.y} width={250} height={70}>
                  <p className="text-[15px] leading-[1.15] font-[620] text-pen-text wdth-condensed">{flag.title}</p>
                  <p className="mt-1 text-[12.5px] text-ink-2">
                    ≈ <span className="tnum font-[620] text-pen-text">{Math.round(flag.viewers_lost)}</span> of every 1,000 viewers gone
                  </p>
                </foreignObject>
              )}
            </svg>
            {gains.length > 0 && (
              <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-rule px-1 pt-3">
                {gains.map((g) => (
                  <div key={g.label} className="story-delta">
                    <dt className="text-[12px] text-ink-3">{g.label}</dt>
                    <dd className="tnum text-[17px] font-[640] text-rev-blue">{g.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </figure>
        </div>
      </div>
    </section>
  );
}
