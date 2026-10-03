"use client";

import clsx from "clsx";
import { ChevronRight } from "lucide-react";

import type { Analysis, Simulation } from "@/lib/contract.gen";
import { fmtTime, pct } from "@/lib/format";
import { revision, type RevisionKey } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

import { retentionAt } from "./geometry";

const MOMENT_LABEL: Record<string, string> = { dip: "Dip", spike: "Spike", intro: "Intro", top: "Top" };

/** The curve as text: key moments, then every bin. Same numbers as the chart, readable without it. */
export function CurveTable({ analysis, sim, draftKey }: { analysis: Analysis; sim: Simulation | null; draftKey: RevisionKey | null }) {
  const { playhead, setPlayhead } = useWorkspace();
  const duration = analysis.metrics.duration_seconds;
  const bins = analysis.curve.bins;
  const rev = draftKey && sim ? revision(draftKey) : null;
  const moments = [...analysis.metrics.key_moments].sort((a, b) => a.start - b.start);
  const rows = bins.map((b, i) => {
    const t = ((i + 1) / bins.length) * duration;
    const startT = (i / bins.length) * duration;
    const notes = [
      ...moments.filter((m) => m.kind !== "intro" && m.start < t && m.end > startT).map((m) => MOMENT_LABEL[m.kind]),
      ...analysis.flags.filter((f) => f.start >= startT && f.start < t).map((f) => f.title),
    ];
    return { i, t, startT, b, after: sim ? retentionAt(sim.curve.bins, sim.metrics.duration_seconds, t).r : null, notes };
  });
  const activeRow = Math.min(bins.length - 1, Math.floor((playhead / Math.max(1, duration)) * bins.length));

  return (
    <details className="group mt-3 border-t border-line pt-2.5 text-[13px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-chip text-[12.5px] font-[500] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="transition-transform duration-200 group-open:rotate-90" />
        Curve as a table
      </summary>
      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <section aria-label="Key moments">
          <h3 className="eyebrow mb-2">Key moments</h3>
          <ul className="space-y-1.5 text-ink-2">
            {moments.map((m, i) => (
              <li key={i}>
                <button type="button" onClick={() => setPlayhead(m.start)} className="text-left hover:underline">
                  <span className="font-[600] text-ink">{MOMENT_LABEL[m.kind]}</span> <span className="tc">{fmtTime(m.start)}–{fmtTime(m.end)}</span>
                </button>
                <span className="block text-[12px] text-ink-3">
                  {m.kind === "intro" && `${m.magnitude.toFixed(0)}% of starters gone by ${fmtTime(m.end)}`}
                  {m.kind === "dip" && `${m.magnitude.toFixed(1)} pts more exits than the baseline`}
                  {m.kind === "spike" && "among the most engaging stretches of the video"}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <div className="max-h-[300px] overflow-y-auto rounded-control border border-line">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Predicted share of starters still watching at the end of each 1% of the video{rev ? `, White draft and ${rev.name} draft` : ""}.
            </caption>
            <thead className="sticky top-0 bg-surface-2 text-[11.5px] text-ink-3 shadow-[0_1px_0_var(--line)]">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-[500]">Time</th>
                <th scope="col" className="px-3 py-1.5 text-right font-[500]">Still watching</th>
                <th scope="col" className="px-3 py-1.5 text-right font-[500]">Likely range</th>
                {rev && <th scope="col" className="px-3 py-1.5 text-right font-[500]" style={{ color: rev.ink }}>{rev.name}</th>}
                <th scope="col" className="px-3 py-1.5 font-[500]">Note</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {rows.map((r) => (
                <tr
                  key={r.i}
                  onClick={() => setPlayhead(r.startT)}
                  className={clsx("cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2/60", r.i === activeRow && playhead > 0 && "bg-accent-wash")}
                >
                  <th scope="row" className="tc px-3 py-1 font-[400] text-ink-2">{fmtTime(r.t)}</th>
                  <td className="px-3 py-1 text-right">{pct(r.b.retention, 1)}</td>
                  <td className="px-3 py-1 text-right text-ink-3">{pct(r.b.lo)}–{pct(r.b.hi)}</td>
                  {rev && <td className="px-3 py-1 text-right" style={{ color: rev.ink }}>{r.after != null ? pct(r.after, 1) : ""}</td>}
                  <td className={clsx("px-3 py-1 text-[12px]", r.notes.some((n) => n !== "Spike") ? "text-drop-text" : "text-ink-3")}>
                    {r.notes.join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
