"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A boolean preference persisted in localStorage, read through an external
 * store so the server render (always `false`) and the hydrated client agree
 * without a setState-in-effect round trip.
 */
const stores = new Map<
  string,
  { value: boolean | undefined; listeners: Set<() => void> }
>();

function store(key: string) {
  let s = stores.get(key);
  if (!s) {
    s = { value: undefined, listeners: new Set() };
    stores.set(key, s);
  }
  return s;
}

function read(key: string): boolean {
  const s = store(key);
  if (s.value === undefined) {
    try {
      s.value = localStorage.getItem(key) === "1";
    } catch {
      s.value = false;
    }
  }
  return s.value;
}

export function usePersistedFlag(
  key: string
): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      const s = store(key);
      s.listeners.add(cb);
      return () => s.listeners.delete(cb);
    },
    () => read(key),
    () => false
  );
  const set = useCallback(
    (on: boolean) => {
      const s = store(key);
      s.value = on;
      try {
        localStorage.setItem(key, on ? "1" : "0");
      } catch {
        // ignore
      }
      for (const l of s.listeners) l();
    },
    [key]
  );
  return [value, set];
}
