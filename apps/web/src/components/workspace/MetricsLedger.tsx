"use client";

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

/** Studio metrics set like a call sheet: one ruled ledger, White draft beside the working revision. */
export function MetricsLedger({ analysis, sim, draftKey }: { analysis: Analysis; sim: Simulation | null; draftKey: RevisionKey | null }) {
  const m = analysis.metrics;
  const a = sim?.metrics ?? null;
  const rev = draftKey ? revision(draftKey) : null;
  const rows: Row[] = [
    {
      label: "Intro retention", hint: "still watching at 0:30",
      base: m.intro_retention, after: a?.intro_retention ?? null,
      render: (v) => `${(v * 100).toFixed(0)}%`, delta: (x, y) => `${y - x >= 0 ? "+" : "−"}${Math.abs((y - x) * 100).toFixed(1)} pts`,
    },
    {
      label: "Average viewed", hint: "APV",
      base: m.apv, after: a?.apv ?? null,
      render: (v) => `${(v * 100).toFixed(0)}%`, delta: (x, y) => `${y - x >= 0 ? "+" : "−"}${Math.abs((y - x) * 100).toFixed(1)} pts`,
    },
    {
      label: "Average view duration", hint: `of ${fmtTime(m.duration_seconds)}`,
      base: m.avd_seconds, after: a?.avd_seconds ?? null,
      render: (v) => fmtTime(v), delta: (x, y) => `${y - x >= 0 ? "+" : "−"}${Math.abs(y - x).toFixed(0)}s`,
    },
  ];
  if (m.viewers_at_payoff != null && m.payoff_time != null) {
    rows.push({
      label: "Viewers at the payoff", hint: `per 1,000 · at ${fmtTime(m.payoff_time)}`,
      base: m.viewers_at_payoff, after: a?.viewers_at_payoff ?? null,
      render: (v) => Math.round(v).toLocaleString("en-IN"), delta: (x, y) => `${y - x >= 0 ? "+" : "−"}${Math.abs(y - x).toFixed(0)}`,
    });
  }

  return (
    <section aria-label="Predicted metrics" className="flex h-full flex-col">
      <div className="flex items-baseline justify-between pb-2 text-[12px] text-ink-3">
        <span>Predicted, per YouTube Studio</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="h-[2px] w-3 bg-ink" />White</span>
          {rev && (
            <span className="flex items-center gap-1.5"><span className="h-[2px] w-3" style={{ background: rev.ink }} />{rev.name}</span>
          )}
        </span>
      </div>
      <dl className="flex flex-1 flex-col justify-between border-t border-rule">
        {rows.map((r) => {
          const improved = r.after != null && r.after > r.base;
          return (
            <div key={r.label} className="grid grid-cols-[1fr_auto] items-end gap-x-4 border-b border-rule py-2.5 last:border-b-0">
              <dt className="min-w-0">
                <span className="block text-[13.5px] font-[560] text-ink-2">{r.label}</span>
                <span className="block text-[11.5px] text-ink-3">{r.hint}</span>
              </dt>
              <dd className="flex items-baseline gap-3 text-right">
                <span className={r.after != null ? "text-[17px] text-ink-3 line-through decoration-1" : "text-[30px] leading-none font-[600] wdth-wide"}>
                  {r.render(r.base)}
                </span>
                {r.after != null && rev && (
                  <span className="flex flex-col items-end">
                    <span className="text-[30px] leading-none font-[620] wdth-wide" style={{ color: rev.ink }}>
                      <Ticker value={r.after} render={r.render} />
                    </span>
                    <span className={`tnum mt-1 text-[11.5px] font-[600] ${improved ? "text-ink" : "text-pen-text"}`}>
                      {r.delta(r.base, r.after)}
                    </span>
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
