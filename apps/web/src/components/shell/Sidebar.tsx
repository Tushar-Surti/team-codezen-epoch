"use client";

import clsx from "clsx";
import {
  EyeOff,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  ImageUp,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Scissors,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button, ThemeCycleButton, ThemeToggle } from "@/components/ui";
import { useNavCollapsed } from "@/lib/nav";

import { BrandMark } from "./BrandMark";

type Item = { href: string; label: string; icon: LucideIcon; match: string[] };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Analyze",
    items: [
      { href: "/projects", label: "Projects", icon: FolderOpen, match: ["/projects", "/a/"] },
      { href: "/new", label: "New analysis", icon: FilePlus2, match: ["/new"] },
      { href: "/hooks", label: "Hook Lab", icon: Zap, match: ["/hooks"] },
      { href: "/shorts", label: "Shorts", icon: Scissors, match: ["/shorts"] },
    ],
  },
  {
    label: "Evidence",
    items: [
      { href: "/lab", label: "Accuracy", icon: FlaskConical, match: ["/lab"] },
      { href: "/blind", label: "Blind test", icon: EyeOff, match: ["/blind"] },
      { href: "/xray", label: "Channel X-Ray", icon: ScanSearch, match: ["/xray"] },
      { href: "/import", label: "Studio check", icon: ImageUp, match: ["/import"] },
    ],
  },
];

/** App navigation. Collapses to an icon rail on request, and always on narrow windows. */
export function Sidebar() {
  const path = usePathname();
  const { collapsed, toggle } = useNavCollapsed();

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-[220px] shrink-0 flex-col border-r border-line bg-nav transition-[width] duration-200 ease-out compact:w-[60px]"
    >
      <div className="flex h-14 shrink-0 items-center px-4 compact:justify-center compact:px-0">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-control" aria-label="Retent AI home">
          <BrandMark />
          <span className="truncate text-[15px] font-[600] tracking-[-0.01em] text-ink compact:hidden">Retent AI</span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 pb-4 compact:px-2">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <p className="eyebrow px-2 pb-1 compact:sr-only">{g.label}</p>
            <ul className="flex flex-col gap-px">
              {g.items.map(({ href, label, icon: Icon, match }) => {
                const active = match.some((m) => path === m || path.startsWith(m));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      title={label}
                      className={clsx(
                        "flex h-8 items-center gap-2.5 rounded-control px-2 text-[13.5px] transition-colors duration-150 compact:justify-center compact:px-0",
                        active
                          ? "bg-(--nav-on-bg) font-[500] text-ink shadow-(--nav-on-ring)"
                          : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <Icon size={17} strokeWidth={1.75} className={active ? "text-ink" : "text-ink-3"} aria-hidden />
                      <span className="truncate compact:sr-only">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-3 compact:flex-col compact:px-0">
        {/* Visibility lives on wrappers: the controls set their own display, which would fight `hidden`. */}
        <span className="contents compact:hidden">
          <ThemeToggle />
        </span>
        <span className="hidden compact:contents">
          <ThemeCycleButton />
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="max-lg:hidden"
        >
          {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
        </Button>
      </div>
    </nav>
  );
}
