// Gemeinsame Bausteine der Ansichten: Kopfzeilen-Tasten, Tagesumschalter, Warnhinweise, leere Zustände.

import { useMemo, type ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { useSheets } from "../ui/overlays";
import { useStatus } from "../lib/store";
import { addDays, daysBetween, fmtDayLong, fmtDayMid, fmtDayShort } from "@shared/dates.ts";
import { entryAlert, type Alert } from "@shared/entryTypes.ts";
import type { Entry } from "@shared/types.ts";
import { ackEntry } from "../lib/data";
import { telHref } from "../lib/profile";
import { EmergencySheet } from "./EmergencySheet";
import { SettingsSheet } from "./settings/SettingsSheet";
import { runUpdate, useUpdate } from "../lib/update";

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

/** Rechts im Seitenkopf: Verbindungsstand, Notfall, Mehr. */
export function HeaderActions({ extra }: { extra?: ReactNode }) {
  const sheets = useSheets();
  const status = useStatus();
  const update = useUpdate();
  const sync = !status.online ? "offline" : status.pending ? "pending" : "";
  return (
    <>
      {sync ? (
        <span className={`state-chip ${sync}`} role="status" title={sync === "offline" ? "Offline: Abhaken und Einträge werden nachgereicht" : "Änderungen werden gesendet"}>
          <i aria-hidden="true" />
          {sync === "offline" ? "Offline" : `${status.pending} senden`}
        </span>
      ) : OTHER_TZ ? (
        <span className="state-chip" title="Alle Uhrzeiten gelten für Berlin">
          Berliner Zeit
        </span>
      ) : null}
      {extra}
      <button type="button" className="ib sos" onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} aria-label="Notfall">
        <Icon name="phone" size={20} stroke={1.9} />
      </button>
      <button type="button" className="ib" onClick={() => sheets.open((close) => <SettingsSheet onClose={close} onUpdate={update.available ? runUpdate : null} />)} aria-label="Mehr und Einstellungen">
        <Icon name="settings" size={20} stroke={1.9} />
      </button>
    </>
  );
}

/** Titel einer Tagesseite: Heute, Gestern, Morgen oder der Wochentag. */
export function dayTitle(day: string, today: string, base = "Heute"): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return base;
  if (diff === -1) return "Gestern";
  if (diff === 1) return "Morgen";
  return fmtDayShort(day);
}

/** Tagesumschalter unter dem Seitentitel: ‹ Dienstag, 20. Oktober › */
export function DayBar({ day, today, onChange }: { day: string; today: string; onChange: (d: string) => void }) {
  const diff = daysBetween(today, day);
  return (
    <div className="daybar">
      <button type="button" className="dn" onClick={() => onChange(addDays(day, -1))} aria-label="Vorheriger Tag">
        <Icon name="left" size={18} stroke={2.2} />
      </button>
      <button type="button" className="dl" onClick={() => onChange(today)} aria-label={diff ? `${fmtDayLong(day)}, zu heute springen` : fmtDayLong(day)}>
        {fmtDayMid(day)}
        {diff ? <b> · zu heute</b> : null}
      </button>
      <button type="button" className="dn" onClick={() => onChange(addDays(day, 1))} aria-label="Nächster Tag">
        <Icon name="right" size={18} stroke={2.2} />
      </button>
    </div>
  );
}

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
    <div className="stack-s blk">
      {alerts.map((a) => (
        <div key={a.entry.id} className={`note col ${a.level === "crit" ? "tone-red" : "tone-amber"}`} role="alert">
          <div className="note-head">
            <Icon name="alert" size={19} stroke={2} />
            <span>
              {a.level === "crit" ? "Klinik anrufen" : "Bitte beachten"} · {a.entry.time}
            </span>
          </div>
          <p className="note-text">{a.text}</p>
          <div className="note-actions">
            {phone && a.level === "crit" ? (
              <a className="btn small sos" href={telHref(phone)}>
                <Icon name="phone" size={18} /> {phone}
              </a>
            ) : null}
            <button className="btn small warn-soft" onClick={() => ackEntry(a.entry.id)}>
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
