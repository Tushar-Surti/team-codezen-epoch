import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "warn" | "risk" | "ai" | "ok";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-2 text-ink-2",
  warn: "border-warn/30 bg-warn-wash text-warn",
  risk: "border-drop/30 bg-drop-wash text-drop-text",
  ai: "border-accent/30 bg-accent-wash text-accent",
  ok: "border-good/30 bg-good-wash text-good",
};

/** Status label. `severity` (1–5) adds a dot from the severity ramp. */
export function Badge({
  tone = "neutral",
  severity,
  dot,
  icon,
  title,
  className,
  children,
}: {
  title?: string;
  tone?: BadgeTone;
  severity?: 1 | 2 | 3 | 4 | 5;
  /** Any CSS color for a leading dot. */
  dot?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const dotColor = severity ? `var(--sev-${severity})` : dot;
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex h-[22px] items-center gap-1.5 rounded-chip border px-2 text-[12px] leading-none font-[500] whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {dotColor && <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ background: dotColor }} />}
      {icon}
      {children}
    </span>
  );
}
