"use client";

import { useCallback, useState } from "react";

/** useState that survives reloads in localStorage. Falls back to `initial` when storage is blocked or the value is invalid. */
export function usePersisted<T>(key: string, initial: T, valid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      return valid(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });
  const save = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // Storage blocked: keep the value for this page view only.
      }
    },
    [key],
  );
  return [value, setValue, save] as const;
}
