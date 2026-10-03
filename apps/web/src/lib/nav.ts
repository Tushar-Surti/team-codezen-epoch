"use client";

import { useCallback, useSyncExternalStore } from "react";

import { NAV_KEY } from "./prepaint";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const read = () => document.documentElement.dataset.nav === "collapsed";

/** Sidebar collapsed state. Lives on <html data-nav> so the pre-paint script can restore it without a flash. */
export function useNavCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    const next = !read();
    if (next) document.documentElement.dataset.nav = "collapsed";
    else delete document.documentElement.dataset.nav;
    try {
      if (next) localStorage.setItem(NAV_KEY, "collapsed");
      else localStorage.removeItem(NAV_KEY);
    } catch {
      // Storage blocked: the change still applies for this page view.
    }
    listeners.forEach((l) => l());
  }, []);
  return { collapsed, toggle };
}
