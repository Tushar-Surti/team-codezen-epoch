"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { type ThemePref, useTheme } from "@/lib/theme";

import { Button } from "./Button";
import { Segmented } from "./Segmented";

const LABEL: Record<ThemePref, string> = { light: "Light", dark: "Dark", system: "Match system" };
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const ORDER: ThemePref[] = ["light", "dark", "system"];

const OPTIONS = ORDER.map((value) => {
  const Icon = ICON[value];
  return { value, label: <span className="sr-only">{LABEL[value]}</span>, hint: LABEL[value], icon: <Icon size={14} aria-hidden /> };
});

export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return <Segmented<ThemePref> label="Theme" size="sm" value={pref} onChange={setPref} options={OPTIONS} className={className} />;
}

/** One icon button that steps light → dark → system. For tight spaces such as the collapsed sidebar. */
export function ThemeCycleButton({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = ICON[pref];
  return (
    <Button
      variant="ghost"
      size="sm"
      icon
      onClick={() => setPref(next)}
      aria-label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[pref]}`}
      className={className}
    >
      <Icon size={15} aria-hidden />
    </Button>
  );
}
