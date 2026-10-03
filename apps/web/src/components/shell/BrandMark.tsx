import clsx from "clsx";

/** The Retent AI mark: a retention curve leaving the top of the frame. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={clsx("grid size-7 shrink-0 place-items-center rounded-control bg-primary text-primary-fg", className)}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-[18px]" aria-hidden>
        <path d="M3 5c3 0 4 1 5 4s2 5 9 5" />
      </svg>
    </span>
  );
}
