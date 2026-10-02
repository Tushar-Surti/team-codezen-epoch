"use client";

import clsx from "clsx";
import { EyeOff, FilePlus2, FlaskConical, FolderOpen, ImageUp, ScanSearch, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/projects", label: "Projects", icon: FolderOpen, match: ["/projects", "/a/"] },
  { href: "/new", label: "New", icon: FilePlus2, match: ["/new"] },
  { href: "/hooks", label: "Hook Lab", icon: Zap, match: ["/hooks"] },
  { href: "/lab", label: "Accuracy", icon: FlaskConical, match: ["/lab"] },
  { href: "/blind", label: "Blind test", icon: EyeOff, match: ["/blind"] },
  { href: "/xray", label: "X-Ray", icon: ScanSearch, match: ["/xray"] },
  { href: "/import", label: "Import", icon: ImageUp, match: ["/import"] },
];

/** Navy cover-stock rail. The two brass brads are the script binding, and the brand's only ornament. */
export function AppRail() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="relative flex h-full w-[76px] shrink-0 flex-col items-center bg-cover pt-4 pb-5 text-cover-ink"
    >
      <Link href="/" className="mb-6 flex flex-col items-center gap-1" aria-label="Retent AI home">
        <span className="flex size-9 items-center justify-center rounded-[7px] bg-cover-3 text-[17px] font-[650] text-cover-ink wdth-condensed">
          <span>
            R<span className="text-brass-bright">.</span>
          </span>
        </span>
      </Link>
      <ul className="flex flex-1 flex-col items-stretch gap-1 self-stretch px-2">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match.some((m) => path === m || path.startsWith(m));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "group relative flex flex-col items-center gap-1 rounded-[7px] py-2 text-[11px] leading-none transition-colors duration-200",
                  active ? "bg-cover-2 text-cover-ink" : "text-cover-ink-2 hover:bg-cover-2/60 hover:text-cover-ink",
                )}
              >
                {active && <span className="absolute top-2 bottom-2 left-[-8px] w-[3px] rounded-r bg-brass-bright" />}
                <Icon size={19} strokeWidth={1.6} aria-hidden />
                <span className="wdth-condensed tracking-[0.01em]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div aria-hidden className="flex flex-col items-center gap-4 pb-1">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="size-2.5 rounded-full bg-brass shadow-[inset_0_-1px_1px_rgb(0_0_0/0.35),0_1px_0_rgb(255_255_255/0.08)]"
          />
        ))}
      </div>
    </nav>
  );
}
