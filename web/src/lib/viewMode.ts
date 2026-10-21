// Ansicht je Gerät: „einfach“ zeigt auf Heute nur den nächsten Schritt mit großen Tasten,
// „ausführlich“ den vollen Tagesplan mit allen Reitern.

import { useSyncExternalStore } from "react";

export type ViewMode = "voll" | "einfach";

const KEY = "spotty-ansicht";
const listeners = new Set<() => void>();

function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === "einfach" ? "einfach" : "voll";
  } catch {
    return "voll";
  }
}

let mode: ViewMode = typeof window === "undefined" ? "voll" : read();

export function setViewMode(m: ViewMode) {
  mode = m;
  try {
    if (m === "voll") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, m);
  } catch {
    /* Speicher gesperrt: gilt bis zum Neuladen */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, () => mode, () => mode);
}
