import clsx from "clsx";

import { Badge, type BadgeTone } from "@/components/ui";
import type { Explanation } from "@/lib/eval";
import { fmtTime } from "@/lib/format";

const VERDICT_TONE: Record<Explanation["verdict"]["level"], BadgeTone> = {
  strong: "ok",
  partial: "neutral",
  weak: "warn",
  miss: "risk",
};

/** Where Retent AI's prediction and YouTube's real curve agree and differ, with the likely reason for each. */
export function WhyDiffer({ explain, compact = false }: { explain: Explanation; compact?: boolean }) {
  const { verdict, differences, agreements } = explain;
  const range = (a: number, b: number) => `${fmtTime(a)}–${fmtTime(b)}`;
  return (
    <section aria-label="Why the curves differ" className={clsx("flex flex-col", compact ? "gap-3" : "gap-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={VERDICT_TONE[verdict.level]}>{verdict.label}</Badge>
        <p className="text-[13px] text-ink-2">{verdict.text}</p>
      </div>

      {differences.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Where they differ, and why</h3>
          <ol className="flex flex-col gap-2">
            {differences.map((d) => (
              <li key={d.start} className="rounded-control border border-line bg-surface px-3 py-2.5">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="tnum font-[600] text-ink">{range(d.start, d.end)}</span>
                  <span className={d.kind === "missed_peak" ? "text-actual" : "text-ink-2"}>{d.title}</span>
                </p>
                {!compact && <p className="mt-1 text-[12.5px] text-ink-3 italic">“{d.said}”</p>}
                <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{d.reason}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {agreements.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Where they agree</h3>
          <ul className="flex flex-col gap-1.5">
            {agreements.map((a) => (
              <li key={a.start} className="text-[12.5px] leading-snug text-ink-2">
                <span className="tnum font-[600] text-ink">{range(a.start, a.end)}</span> both rise
                {!compact && <span className="text-ink-3 italic"> · “{a.said}”</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[12px] leading-snug text-ink-3">
        Retent AI reads only the words. YouTube’s curve also counts rewatches and reacts to what’s on screen, so some
        differences are expected even when the prediction is right about the script.
      </p>
    </section>
  );
}
