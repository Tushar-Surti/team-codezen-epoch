"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DARK_QUERY as QUERY, THEME_KEY as KEY } from "./theme-script";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia(QUERY).matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia(QUERY);
  const onSystemChange = () => {
    if (readPref() === "system") apply("system");
    cb();
  };
  mq.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystemChange);
  };
}

/** The saved preference (system/light/dark), the theme actually showing, and a setter. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as const);
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as const);
  const setPref = useCallback((p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      // Storage blocked: the choice still applies for this page view.
    }
    apply(p);
    notify();
  }, []);
  return { pref, theme, setPref };
}
