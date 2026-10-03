import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Style = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, for an icon on its own. Give it an aria-label. */
  icon?: boolean;
  block?: boolean;
};
type Common = Style & { loading?: boolean; className?: string; children?: ReactNode };
type AsButton = Common & Omit<ComponentProps<"button">, keyof Common>;
type AsLink = Common & Omit<ComponentProps<typeof Link>, keyof Common>;
export type ButtonProps = AsButton | AsLink;

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent leading-none [font-weight:var(--fw-control)] select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary: "border-line-strong bg-surface text-ink hover:border-ink-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "border-drop/45 text-drop-text hover:bg-drop-wash",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-(--h-control-sm) px-2.5 text-[12.5px]",
  md: "h-(--h-control) px-(--px-control) text-(length:--fs-control)",
  lg: "h-(--h-control-lg) px-5 text-[15px]",
};

const ICON: Record<ButtonSize, string> = {
  sm: "w-(--h-control-sm) px-0",
  md: "w-(--h-control) px-0",
  lg: "w-(--h-control-lg) px-0",
};

/** Class string for places that can't render <Button>, such as a <label> styled as a button. */
export function buttonClass({ variant = "primary", size = "md", icon = false, block = false }: Style = {}) {
  return clsx(BASE, VARIANT[variant], SIZE[size], icon && ICON[size], block && "w-full");
}

function isLink(p: ButtonProps): p is AsLink {
  return "href" in p && p.href !== undefined;
}

/** The one button. Renders a next/link when given `href`. */
export function Button(props: ButtonProps) {
  if (isLink(props)) {
    const { variant, size, icon, block, loading, className, children, ...link } = props;
    return (
      <Link {...link} className={clsx(buttonClass({ variant, size, icon, block }), className)}>
        {loading && <Spinner />}
        {children}
      </Link>
    );
  }
  const { variant, size, icon, block, loading, className, children, type = "button", disabled, ...button } = props;
  return (
    <button
      {...button}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(buttonClass({ variant, size, icon, block }), className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
