// Zeitpunkt, zu dem diese Person das Tagesprotokoll zuletzt angesehen hat (je Gerät).
// Was andere danach eingetragen haben, gilt als neu.

import { useSyncExternalStore } from "react";

const KEY = "spotty-seen-log";
const listeners = new Set<() => void>();

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (v > 0) return v;
  } catch {
    /* Speicher gesperrt */
  }
  return 0;
}

let seen = typeof window === "undefined" ? 0 : read();
if (typeof window !== "undefined" && !seen) markSeen();

export function getSeen(): number {
  return seen;
}

export function markSeen(at = Date.now()) {
  seen = at;
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    /* Speicher gesperrt */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSeen(): number {
  return useSyncExternalStore(subscribe, () => seen, () => seen);
}
