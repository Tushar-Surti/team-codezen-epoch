"use client";

import clsx from "clsx";

import type { Analysis, Simulation } from "@/lib/contract.gen";
import { fmtTime, pct } from "@/lib/format";
import { revision, type RevisionKey } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

import { retentionAt } from "./geometry";

const MOMENT_LABEL: Record<string, string> = { dip: "Dip", spike: "Spike", intro: "Intro", top: "Top" };

/** The curve as text: key moments, then every bin. Same numbers as the chart, readable without it. */
export function CurveTable({
  analysis,
  sim,
  draftKey,
  note,
}: {
  analysis: Analysis;
  sim: Simulation | null;
  draftKey: RevisionKey | null;
  /** Caveat shown above the key moments, e.g. that the absolute level is uncalibrated. */
  note?: string;
}) {
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
    <div className="grid gap-x-8 gap-y-6 p-4 text-[13px] lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
        {note && <p className="text-[12.5px] leading-relaxed text-ink-3">{note}</p>}
        <section aria-label="Key moments">
          <h3 className="eyebrow mb-2">Key moments</h3>
          <ul className="flex flex-col gap-2 text-ink-2">
            {moments.map((m, i) => (
              <li key={i}>
                <button type="button" onClick={() => setPlayhead(m.start)} className="rounded-chip text-left hover:underline">
                  <span className="font-[600] text-ink">{MOMENT_LABEL[m.kind]}</span>{" "}
                  <span className="tc">
                    {fmtTime(m.start)}–{fmtTime(m.end)}
                  </span>
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
      </div>
      <table className="w-full border-separate border-spacing-0 rounded-control border border-line text-left">
        <caption className="sr-only">
          Predicted share of starters still watching at the end of each 1% of the video{rev ? `, White draft and ${rev.name} draft` : ""}.
        </caption>
        <thead className="sticky top-0 z-[1] text-[11.5px] text-ink-3">
          <tr className="[&>th]:bg-surface-2 [&>th:first-child]:rounded-tl-[5px] [&>th:last-child]:rounded-tr-[5px]">
            <th scope="col" className="border-b border-line px-3 py-2 font-[500]">Time</th>
            <th scope="col" className="border-b border-line px-3 py-2 text-right font-[500]">Still watching</th>
            <th scope="col" className="border-b border-line px-3 py-2 text-right font-[500]">Likely range</th>
            {rev && (
              <th scope="col" className="border-b border-line px-3 py-2 text-right font-[500]" style={{ color: rev.ink }}>
                {rev.name}
              </th>
            )}
            <th scope="col" className="w-full border-b border-line px-3 py-2 font-[500]">Note</th>
          </tr>
        </thead>
        <tbody className="tnum [&>tr:last-child>*]:border-b-0">
          {rows.map((r) => (
            <tr
              key={r.i}
              onClick={() => setPlayhead(r.startT)}
              className={clsx("cursor-pointer hover:bg-surface-2/60", r.i === activeRow && playhead > 0 && "bg-accent-wash")}
            >
              <th scope="row" className="tc border-b border-line px-3 py-1.5 font-[400] whitespace-nowrap text-ink-2">{fmtTime(r.t)}</th>
              <td className="border-b border-line px-3 py-1.5 text-right whitespace-nowrap">{pct(r.b.retention, 1)}</td>
              <td className="border-b border-line px-3 py-1.5 text-right whitespace-nowrap text-ink-3">
                {pct(r.b.lo)}–{pct(r.b.hi)}
              </td>
              {rev && (
                <td className="border-b border-line px-3 py-1.5 text-right whitespace-nowrap" style={{ color: rev.ink }}>
                  {r.after != null ? pct(r.after, 1) : ""}
                </td>
              )}
              <td className={clsx("border-b border-line px-3 py-1.5 text-[12px]", r.notes.some((n) => n !== "Spike") ? "text-drop-text" : "text-ink-3")}>
                {r.notes.join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
