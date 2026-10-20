// Gemeinsame Bausteine der Ansichten.

import { useMemo, type ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { addDays, daysBetween, fmtDayLong, fmtDayShort } from "@shared/dates.ts";
import { entryAlert, type Alert } from "@shared/entryTypes.ts";
import type { Category, Entry } from "@shared/types.ts";
import { ackEntry } from "../lib/data";

export const CAT_LABEL: Record<Category, string> = {
  med: "Medikament",
  inh: "Inhalation",
  feed: "Futter",
  mess: "Messen",
  foto: "Protokoll",
  care: "Pflege",
};

export function DayNav({ day, today, onChange }: { day: string; today: string; onChange: (d: string) => void }) {
  const diff = daysBetween(today, day);
  const head = diff === 0 ? "Heute" : diff === -1 ? "Gestern" : diff === 1 ? "Morgen" : fmtDayShort(day);
  return (
    <div className="daynav">
      <button className="icon-btn" onClick={() => onChange(addDays(day, -1))} aria-label="Vorheriger Tag">
        <Icon name="left" />
      </button>
      <button className="label" onClick={() => onChange(today)} aria-label="Zu heute springen">
        <b>{head}</b>
        <span>{fmtDayLong(day)}</span>
      </button>
      <button className="icon-btn" onClick={() => onChange(addDays(day, 1))} aria-label="Nächster Tag">
        <Icon name="right" />
      </button>
    </div>
  );
}

export interface DayAlert extends Alert {
  entry: Entry;
}

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

export function AlertBanners({ alerts, phone }: { alerts: DayAlert[]; phone?: string | null }) {
  if (!alerts.length) return null;
  return (
    <div className="stack-s">
      {alerts.map((a) => (
        <div key={a.entry.id} className={`banner ${a.level}`} role="alert">
          <div className="head">
            <Icon name="alert" size={20} />
            <span>
              {a.level === "crit" ? "Klinik anrufen" : "Bitte beachten"} · {a.entry.time}
            </span>
          </div>
          <p>{a.text}</p>
          <div className="row">
            {phone && a.level === "crit" ? (
              <a className="btn small danger" href={`tel:${phone.replace(/[^+0-9]/g, "")}`}>
                <Icon name="phone" size={18} /> {phone}
              </a>
            ) : null}
            <button className="btn small ghost" onClick={() => ackEntry(a.entry.id)}>
              Gesehen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}
