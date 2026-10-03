import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

/** A bordered surface for one block of the interface. */
export function Panel({
  padded = true,
  className,
  ...props
}: ComponentProps<"section"> & { padded?: boolean }) {
  return (
    <section
      {...props}
      className={clsx("min-w-0 rounded-panel border border-line bg-surface", padded && "p-(--pad-panel)", className)}
    />
  );
}

/** Panel title with optional actions on the right. Mono caps in dark, sentence case in light. */
export function PanelHeader({
  title,
  actions,
  id,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  id?: string;
  as?: "h2" | "h3" | "h4";
  className?: string;
}) {
  return (
    <div className={clsx("mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", className)}>
      <Heading id={id} className="panel-title">
        {title}
      </Heading>
      {actions && <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">{actions}</div>}
    </div>
  );
}
