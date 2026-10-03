import clsx from "clsx";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui";
import type { ConfidenceLevel } from "@/lib/eval";

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: "High", medium: "Medium", low: "Low" };
export const CONFIDENCE_TONE: Record<ConfidenceLevel, BadgeTone> = { high: "ok", medium: "neutral", low: "warn" };
// Same wording as retent_core.trust.SUMMARY, for places that only have the level (the Blind test).
export const CONFIDENCE_SUMMARY: Record<ConfidenceLevel, string> = {
  high: "Reliable for where attention rises and falls in videos like this.",
  medium: "Usually right about the overall shape; individual moments can be off.",
  low: "Unsure. Treat the drops as hints to check, not as predictions.",
};
const ICON = { high: ShieldCheck, medium: ShieldQuestion, low: ShieldAlert };

/** How much to trust a prediction, with the held-out evidence behind it and a disclaimer when it's low. */
export function ConfidenceCard({
  level,
  summary,
  evidence,
  reasons = [],
  disclaimer,
  framed = true,
  title = "How much to trust this curve",
}: {
  level: ConfidenceLevel;
  summary?: string;
  evidence?: string | null;
  reasons?: string[];
  disclaimer?: string | null;
  framed?: boolean;
  title?: string;
}) {
  const Icon = ICON[level];
  return (
    <section
      aria-label={title}
      className={clsx(framed && "rounded-panel border border-line bg-surface p-4")}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} aria-hidden className={level === "high" ? "text-good" : level === "low" ? "text-warn" : "text-ink-3"} />
        <h3 className="text-[13px] font-[600] text-ink">{title}</h3>
        <Badge tone={CONFIDENCE_TONE[level]} size="sm" className="ml-auto">
          {CONFIDENCE_LABEL[level]} confidence
        </Badge>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink">{summary ?? CONFIDENCE_SUMMARY[level]}</p>
      {evidence && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{evidence}</p>}
      {reasons.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-snug text-ink-2">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {disclaimer && (
        <p role="note" className="mt-3 rounded-control border border-warn/30 bg-warn-wash px-3 py-2 text-[12.5px] leading-snug text-warn">
          {disclaimer}
        </p>
      )}
    </section>
  );
}
