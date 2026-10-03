"use client";

import clsx from "clsx";
import { type ReactNode, useState } from "react";

/** A file picker you can also drop onto. Keyboard users reach the hidden input through the label. */
export function Dropzone({
  accept,
  onFile,
  label,
  className,
  children,
}: {
  accept: string;
  onFile: (file: File | null) => void;
  /** Accessible name for the file input. */
  label: string;
  /** Include padding here; the dropzone sets none so callers never fight a default. */
  className?: string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={clsx(
        "flex cursor-pointer flex-col items-center justify-center rounded-panel border border-dashed text-center transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-wash)]",
        dragging ? "border-accent bg-accent-wash" : "border-line-strong bg-surface hover:border-ink-3",
        className,
      )}
    >
      <input type="file" accept={accept} aria-label={label} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {children}
    </label>
  );
}
