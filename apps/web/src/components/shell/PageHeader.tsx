import clsx from "clsx";
import type { ReactNode } from "react";

/** Top of an app page: title, one line of context, and the page's actions. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Extra row under the title, such as filters. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("border-b border-line bg-surface px-8 pt-7 pb-5 compact:px-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-[24px] leading-tight font-[600] tracking-[-0.02em] text-ink">{title}</h1>
          {description && <p className="max-w-[72ch] text-[14px] text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}
