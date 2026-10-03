"use client";

import clsx from "clsx";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

export type TabItem<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; controls?: string };

/** Underlined tabs: ink underline in light, accent in dark. Arrow keys move between tabs. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: readonly TabItem<T>[];
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={clsx("flex flex-wrap gap-1 border-b border-line", className)}>
      {items.map((t, i) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={t.controls}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-2.5 py-2 text-[13.5px] font-[500] transition-colors duration-150",
              on ? "border-(--tab-active) text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
