// Neue App-Version: Hinweis vom Hintergrunddienst entgegennehmen und auf Wunsch neu laden.

import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    __spottyUpdate?: (reload?: boolean) => Promise<void>;
    __spottyNeedsUpdate?: boolean;
  }
}

const listeners = new Set<() => void>();
let available = typeof window !== "undefined" && !!window.__spottyNeedsUpdate;
let dismissed = false;

if (typeof window !== "undefined") {
  window.addEventListener("spotty-update", () => {
    available = true;
    dismissed = false;
    for (const l of listeners) l();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Ist eine neue Version bereit? (`dismissed`: Hinweis wurde für diese Sitzung weggeklickt) */
export function useUpdate(): { available: boolean; dismissed: boolean } {
  const a = useSyncExternalStore(subscribe, () => available, () => available);
  const d = useSyncExternalStore(subscribe, () => dismissed, () => dismissed);
  return { available: a, dismissed: d };
}

export function runUpdate() {
  void window.__spottyUpdate?.(true);
}

export function dismissUpdate() {
  dismissed = true;
  for (const l of listeners) l();
}
