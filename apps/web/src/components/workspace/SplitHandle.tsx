"use client";

import clsx from "clsx";
import { type RefObject, useRef } from "react";

/** Horizontal divider between two stacked panes. Drag, arrow keys, or double-click / Enter to reset. */
export function SplitHandle({
  value,
  onChange,
  onCommit,
  container,
  min,
  max,
  reset,
  label,
  className,
}: {
  /** Height of the pane above, as a percentage of the container's content height. */
  value: number;
  onChange: (pct: number) => void;
  /** Called when a drag or key press finishes, to persist the value. */
  onCommit: (pct: number) => void;
  container: RefObject<HTMLElement | null>;
  min: number;
  max: number;
  reset: number;
  label: string;
  className?: string;
}) {
  const latest = useRef(value);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const set = (v: number) => {
    latest.current = clamp(v);
    onChange(latest.current);
  };

  function pctAt(clientY: number) {
    const el = container.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const top = r.top + parseFloat(cs.paddingTop);
    const height = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return ((clientY - top) / Math.max(1, height)) * 100;
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.cursor = "row-resize";
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) set(pctAt(e.clientY));
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.style.cursor = "";
        onCommit(latest.current);
      }}
      onDoubleClick={() => {
        set(reset);
        onCommit(latest.current);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 8 : 2;
        const next =
          e.key === "ArrowUp" ? value - step
          : e.key === "ArrowDown" ? value + step
          : e.key === "Home" ? min
          : e.key === "End" ? max
          : e.key === "Enter" ? reset
          : null;
        if (next === null) return;
        e.preventDefault();
        set(next);
        onCommit(latest.current);
      }}
      className={clsx(
        "group relative flex shrink-0 cursor-row-resize touch-none items-center justify-center outline-none select-none",
        className,
      )}
    >
      {/* Hairline across the gap, and a grip that lights up on hover, drag and keyboard focus. */}
      <span aria-hidden className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-transparent transition-colors duration-150 group-hover:bg-line-strong group-focus-visible:bg-accent group-active:bg-accent" />
      <span
        aria-hidden
        className="relative h-1 w-10 rounded-full bg-line-strong transition-colors duration-150 group-hover:bg-ink-3 group-focus-visible:bg-accent group-active:bg-accent"
      />
    </div>
  );
}
