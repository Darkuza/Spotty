// Aktuelle Berliner Zeit für alle Seiten aus einer Quelle (ein Zeitgeber statt vieler).

import { createContext, useContext, type ReactNode } from "react";
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
