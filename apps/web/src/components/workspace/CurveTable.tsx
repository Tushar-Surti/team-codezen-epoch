"use client";

import clsx from "clsx";

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
    <details className="group mt-2 text-[13px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[4px] text-[12.5px] font-[580] text-ink-2 hover:text-ink">
        <span aria-hidden className="inline-block transition-transform duration-200 group-open:rotate-90">›</span>
        Curve as a table
      </summary>
      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <section aria-label="Key moments">
          <h3 className="mb-1.5 text-[12.5px] font-[620] text-ink-2">Key moments</h3>
          <ul className="space-y-1.5 text-ink-2">
            {moments.map((m, i) => (
              <li key={i} className="tnum">
                <button type="button" onClick={() => setPlayhead(m.start)} className="text-left hover:underline">
                  <span className="font-[600] text-ink">{MOMENT_LABEL[m.kind]}</span> {fmtTime(m.start)}–{fmtTime(m.end)}
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
        <div className="max-h-[340px] overflow-y-auto rounded-[4px] border border-rule">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Predicted share of starters still watching at the end of each 1% of the video{rev ? `, White draft and ${rev.name} draft` : ""}.
            </caption>
            <thead className="sticky top-0 bg-paper-raised text-[12px] text-ink-3 shadow-[0_1px_0_var(--rule)]">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-[560]">Time</th>
                <th scope="col" className="px-3 py-1.5 text-right font-[560]">Still watching</th>
                <th scope="col" className="px-3 py-1.5 text-right font-[560]">Likely range</th>
                {rev && <th scope="col" className="px-3 py-1.5 text-right font-[560]" style={{ color: rev.ink }}>{rev.name}</th>}
                <th scope="col" className="px-3 py-1.5 font-[560]">Note</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {rows.map((r) => (
                <tr
                  key={r.i}
                  onClick={() => setPlayhead(r.startT)}
                  className={clsx("cursor-pointer border-b border-rule last:border-b-0 hover:bg-paper-sunk/60", r.i === activeRow && playhead > 0 && "bg-paper-sunk")}
                >
                  <th scope="row" className="px-3 py-1 font-[450] text-ink-2">{fmtTime(r.t)}</th>
                  <td className="px-3 py-1 text-right">{pct(r.b.retention, 1)}</td>
                  <td className="px-3 py-1 text-right text-ink-3">{pct(r.b.lo)}–{pct(r.b.hi)}</td>
                  {rev && <td className="px-3 py-1 text-right" style={{ color: rev.ink }}>{r.after != null ? pct(r.after, 1) : ""}</td>}
                  <td className={clsx("px-3 py-1 text-[12px]", r.notes.some((n) => n !== "Spike") ? "text-pen-text" : "text-ink-3")}>
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
