// Gemeinsame Bausteine der Ansichten: Warnhinweise des Tages, leere Zustände, Zeitzonenhinweis.

import { useMemo, type ReactNode } from "react";
import { entryAlert, type Alert } from "@shared/entryTypes.ts";
import type { Entry } from "@shared/types.ts";

export { CAT_LABEL } from "../ui/kinds";

/** Gerät steht in einer anderen Zeitzone als Berlin: Uhrzeiten der App gelten trotzdem für Berlin. */
export const OTHER_TZ = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === "Europe/Berlin") return false;
    const probe = new Date();
    const fmt = (zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(probe);
    return fmt(tz) !== fmt("Europe/Berlin");
  } catch {
    return false;
  }
})();

export interface DayAlert extends Alert {
  entry: Entry;
}

/** Warnhinweise aus den Einträgen eines Tages, die noch niemand als gesehen markiert hat. */
export function useDayAlerts(entries: Entry[], day: string): DayAlert[] {
  return useMemo(() => {
    const out: DayAlert[] = [];
    for (const e of entries) {
      if (e.day !== day || e.ack) continue;
      const a = entryAlert(e);
      if (a && a.level !== "info") out.push({ ...a, entry: e });
    }
    const rank = { crit: 0, warn: 1, info: 2 } as const;
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }, [entries, day]);
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}
