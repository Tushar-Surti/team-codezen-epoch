import clsx from "clsx";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent", className)}
    />
  );
}
