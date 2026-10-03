"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { type ThemePref, useTheme } from "@/lib/theme";

import { Segmented } from "./Segmented";

const OPTIONS = [
  { value: "light", label: <span className="sr-only">Light</span>, hint: "Light", icon: <Sun size={14} aria-hidden /> },
  { value: "dark", label: <span className="sr-only">Dark</span>, hint: "Dark", icon: <Moon size={14} aria-hidden /> },
  { value: "system", label: <span className="sr-only">System</span>, hint: "Match system", icon: <Monitor size={14} aria-hidden /> },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return <Segmented<ThemePref> label="Theme" size="sm" value={pref} onChange={setPref} options={OPTIONS} className={className} />;
}
