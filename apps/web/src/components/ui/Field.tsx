"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { type ComponentProps, type ReactNode, createContext, useContext, useId } from "react";

type FieldCtx = { id: string; describedBy?: string; invalid: boolean };
const Ctx = createContext<FieldCtx | null>(null);

/** Label, control and help text, wired together for screen readers. */
export function Field({
  label,
  help,
  error,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? help;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-[600] text-ink">
        {label}
        {optional && <span className="ml-1.5 font-[400] text-ink-3">optional</span>}
      </label>
      <Ctx.Provider value={{ id, describedBy: note ? noteId : undefined, invalid: !!error }}>{children}</Ctx.Provider>
      {note && (
        <p id={noteId} className={clsx("text-[12px] leading-snug", error ? "text-drop-text" : "text-ink-3")}>
          {note}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "w-full rounded-control border border-line-strong bg-surface text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 hover:border-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-wash)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-drop";

function useFieldProps(id?: string) {
  const ctx = useContext(Ctx);
  return {
    id: id ?? ctx?.id,
    "aria-describedby": ctx?.describedBy,
    "aria-invalid": ctx?.invalid || undefined,
  };
}

export function Input({ className, id, inputSize = "md", ...props }: ComponentProps<"input"> & { inputSize?: "md" | "lg" }) {
  const field = useFieldProps(id);
  return (
    <input
      {...field}
      {...props}
      className={clsx(CONTROL, "px-3", inputSize === "lg" ? "h-(--h-control-lg) text-[15px]" : "h-(--h-input) text-[14px]", className)}
    />
  );
}

export function Select({ className, id, children, ...props }: ComponentProps<"select">) {
  const field = useFieldProps(id);
  return (
    <div className="relative">
      <select {...field} {...props} className={clsx(CONTROL, "h-(--h-input) appearance-none truncate pr-9 pl-3 text-[14px]", className)}>
        {children}
      </select>
      <ChevronDown size={15} aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

export function Textarea({ className, id, ...props }: ComponentProps<"textarea">) {
  const field = useFieldProps(id);
  return <textarea {...field} {...props} className={clsx(CONTROL, "min-h-24 px-3 py-2 text-[14px] leading-relaxed", className)} />;
}
