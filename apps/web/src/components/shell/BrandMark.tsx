import clsx from "clsx";

const SIZE = { md: "size-7 [&>svg]:size-[18px]", sm: "size-5 [&>svg]:size-[13px]" } as const;

/** The Retent AI mark: a retention curve leaving the top of the frame. */
export function BrandMark({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-control bg-primary text-primary-fg", SIZE[size], className)}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <path d="M3 5c3 0 4 1 5 4s2 5 9 5" />
      </svg>
    </span>
  );
}
