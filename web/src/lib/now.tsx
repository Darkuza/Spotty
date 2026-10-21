// Aktuelle Berliner Zeit für alle Seiten aus einer Quelle (ein Zeitgeber statt vieler).

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { berlinNow, type BerlinNow } from "@shared/dates.ts";
import { useNow } from "./hooks";

const NowCtx = createContext<BerlinNow | null>(null);

export function NowProvider({ children }: { children: ReactNode }) {
  const now = useNow();
  return <NowCtx.Provider value={now}>{children}</NowCtx.Provider>;
}

export function useNowValue(): BerlinNow {
  return useContext(NowCtx) ?? berlinNow();
}

/**
 * Seiten mit Tagesauswahl: Zeigt die Seite gerade „heute“ und es wird Mitternacht,
 * springt sie auf den neuen Tag. Ein bewusst gewählter anderer Tag bleibt stehen.
 */
export function useFollowToday(today: string, day: string, setDay: (d: string) => void) {
  const prev = useRef(today);
  useEffect(() => {
    if (prev.current === today) return;
    if (day === prev.current) setDay(today);
    prev.current = today;
  }, [today, day, setDay]);
}
