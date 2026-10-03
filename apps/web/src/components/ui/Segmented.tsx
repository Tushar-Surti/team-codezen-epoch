"use client";

import clsx from "clsx";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

export type SegmentedOption<T extends string> = { value: T; label: ReactNode; hint?: string; icon?: ReactNode };

/** Single choice from a few options. A radio group: arrow keys move the choice. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        "inline-flex gap-0.5 rounded-[calc(var(--r-control)+2px)] border border-line-strong bg-surface p-0.5",
        className,
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.hint}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              "inline-flex items-center justify-center gap-1.5 rounded-control font-[500] whitespace-nowrap transition-[background-color,color,box-shadow] duration-150",
              size === "sm" ? "h-[calc(var(--h-control-sm)-6px)] px-2 text-[12px]" : "h-[calc(var(--h-control)-6px)] px-3 text-[13px]",
              on ? "bg-(--seg-on-bg) text-(--seg-on-fg) shadow-(--seg-on-ring)" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
