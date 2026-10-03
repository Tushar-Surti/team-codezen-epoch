"use client";

import clsx from "clsx";
import { animate, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect } from "react";

import type { Analysis, Simulation } from "@/lib/contract.gen";
import { fmtTime } from "@/lib/format";
import { revision, type RevisionKey } from "@/lib/revisions";

type Row = {
  label: string;
  hint: string;
  base: number;
  after: number | null;
  render: (v: number) => string;
  delta: (a: number, b: number) => string;
};

function Ticker({ value, render }: { value: number; render: (v: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => render(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

/** Studio metrics in one ledger: the White draft, and beside it the working revision with its change. */
export function MetricsLedger({ analysis, sim, draftKey }: { analysis: Analysis; sim: Simulation | null; draftKey: RevisionKey | null }) {
  const m = analysis.metrics;
  const a = sim?.metrics ?? null;
  const rev = draftKey ? revision(draftKey) : null;
  const pts = (x: number, y: number) => `${y - x >= 0 ? "+" : "−"}${Math.abs((y - x) * 100).toFixed(1)} pts`;
  const rows: Row[] = [
    {
      label: "Intro retention", hint: "still watching at 0:30",
      base: m.intro_retention, after: a?.intro_retention ?? null,
      render: (v) => `${(v * 100).toFixed(0)}%`, delta: pts,
    },
    {
      label: "Average viewed", hint: "APV",
      base: m.apv, after: a?.apv ?? null,
      render: (v) => `${(v * 100).toFixed(0)}%`, delta: pts,
    },
    {
      label: "Average view duration", hint: `AVD, of ${fmtTime(m.duration_seconds)}`,
      base: m.avd_seconds, after: a?.avd_seconds ?? null,
      render: (v) => fmtTime(v), delta: (x, y) => `${y - x >= 0 ? "+" : "−"}${Math.abs(y - x).toFixed(0)}s`,
    },
  ];
  if (m.viewers_at_payoff != null && m.payoff_time != null) {
    rows.push({
      label: "Viewers at the payoff", hint: `per 1,000, at ${fmtTime(m.payoff_time)}`,
      base: m.viewers_at_payoff, after: a?.viewers_at_payoff ?? null,
      render: (v) => Math.round(v).toLocaleString("en-IN"), delta: (x, y) => `${y - x >= 0 ? "+" : "−"}${Math.abs(y - x).toFixed(0)}`,
    });
  }

  return (
    <section aria-labelledby="metrics-heading" className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h2 id="metrics-heading" className="panel-title">
          Predicted metrics
        </h2>
        <span className="flex items-center gap-3 text-[12px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-[2px] w-3 rounded-full bg-ink" />
            White
          </span>
          {rev && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-[2px] w-3 rounded-full" style={{ background: rev.ink }} />
              {rev.name}
            </span>
          )}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line">
        {rows.map((r, i) => {
          const improved = r.after != null && r.after > r.base;
          const lone = rows.length % 2 === 1 && i === rows.length - 1;
          return (
            <div key={r.label} className={clsx("flex min-w-0 flex-col gap-1 bg-surface px-3 py-2.5", lone && "col-span-2")}>
              <dt className="min-w-0">
                <span className="block truncate text-[12.5px] font-[500] text-ink-2">{r.label}</span>
                <span className="block truncate text-[11px] text-ink-3">{r.hint}</span>
              </dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                {r.after != null && rev ? (
                  <>
                    <span className="tnum text-[24px] leading-none font-[600] tracking-[-0.02em]" style={{ color: rev.ink }}>
                      <Ticker value={r.after} render={r.render} />
                    </span>
                    <span className="tnum text-[12px] text-ink-3 line-through decoration-1">{r.render(r.base)}</span>
                    <span className={clsx("tnum basis-full text-[11.5px] font-[600]", improved ? "text-good" : "text-drop-text")}>
                      {r.delta(r.base, r.after)}
                    </span>
                  </>
                ) : (
                  <span className="tnum text-[24px] leading-none font-[600] tracking-[-0.02em] text-ink">{r.render(r.base)}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
