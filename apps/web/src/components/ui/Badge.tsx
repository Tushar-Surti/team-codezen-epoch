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

// Sizes are props, not className overrides: two height or font-size utilities on one element
// have no reliable winner in Tailwind.
const SIZE = {
  md: "h-[22px] gap-1.5 px-2 text-[12px]",
  sm: "h-5 gap-1.5 px-1.5 text-[11px]",
  xs: "h-[18px] gap-1 px-1.5 text-[11px]",
} as const;

/** Status label. `severity` (1–5) adds a dot from the severity ramp. */
export function Badge({
  tone = "neutral",
  size = "md",
  severity,
  dot,
  icon,
  title,
  className,
  children,
}: {
  tone?: BadgeTone;
  size?: keyof typeof SIZE;
  severity?: 1 | 2 | 3 | 4 | 5;
  /** Any CSS color for a leading dot. */
  dot?: string;
  icon?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const dotColor = severity ? `var(--sev-${severity})` : dot;
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center rounded-chip border leading-none font-[500] whitespace-nowrap",
        SIZE[size],
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
