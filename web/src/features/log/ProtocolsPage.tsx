// Tagesprotokolle: alle Tage mit Einträgen, Fotos vom Papierprotokoll oder Notizen, nach Monaten gruppiert.
// Ein Tag öffnet das Tagesprotokoll mit Einträgen, Papierfotos und Tagesbilanz.

import { useMemo } from "react";
import { useDayNotes, useEntries, usePhotos } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { openSub } from "../../lib/route";
import { Group, NavBar, Row, Screen } from "../../ui/ios";
import { StorageImage } from "../../ui/StorageImage";
import { MONTHS, addDays, fmtDayMid } from "@shared/dates.ts";
import type { Photo } from "@shared/types.ts";
import { plural } from "../../lib/health/format";

/** Angaben wie „26 Einträge“ nicht zwischen Zahl und Wort umbrechen. */
const keep = (s: string) => s.replace(/ /g, "\u00a0");

interface DayInfo {
  day: string;
  entries: number;
  photos: Photo[];
  note: boolean;
}

export function ProtocolsPage({ back }: { back: string }) {
  const entries = useEntries();
  const photos = usePhotos();
  const notes = useDayNotes();
  const now = useNowValue();

  const months = useMemo(() => {
    const byDay = new Map<string, DayInfo>();
    const get = (day: string) => {
      let x = byDay.get(day);
      if (!x) {
        x = { day, entries: 0, photos: [], note: false };
        byDay.set(day, x);
      }
      return x;
    };
    get(now.day);
    for (const e of entries) get(e.day).entries++;
    for (const p of photos) get(p.day).photos.push(p);
    for (const n of notes) if (n.note || n.nacht || n.paper_ml != null || n.paper_g != null) get(n.day).note = true;
    const out = new Map<string, DayInfo[]>();
    for (const d of [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day))) {
      d.photos.sort((a, b) => a.time.localeCompare(b.time));
      const key = d.day.slice(0, 7);
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(d);
    }
    return [...out.entries()];
  }, [entries, photos, notes, now.day]);

  const yesterday = addDays(now.day, -1);
  return (
    <Screen>
      <NavBar title="Tagesprotokolle" large back={back} />
      {months.map(([key, days], i) => (
        <Group key={key} header={`${MONTHS[parseInt(key.slice(5, 7), 10) - 1]} ${key.slice(0, 4)}`} footer={i === months.length - 1 ? "Jeder Tag mit Einträgen, Fotos vom Papierprotokoll oder Notizen. Fotos und Einträge lassen sich im Tagesprotokoll ergänzen." : undefined}>
          {days.map((d) => (
            <Row
              key={d.day}
              glyph="notes"
              color="var(--blue)"
              title={d.day === now.day ? "Heute" : d.day === yesterday ? "Gestern" : fmtDayMid(d.day)}
              sub={[
                d.day === now.day || d.day === yesterday ? fmtDayMid(d.day) : "",
                d.entries ? keep(plural(d.entries, "Eintrag", "Einträge")) : "keine Einträge",
                d.photos.length ? keep(`${plural(d.photos.length, "Foto", "Fotos")} vom Papier`) : "",
                d.note ? "Notiz" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              wrap
              accessory={
                d.photos.length ? (
                  <span className="pthumb" aria-hidden="true">
                    <StorageImage bucket="photos" path={d.photos[0].path} alt="" />
                  </span>
                ) : undefined
              }
              chevron
              onClick={() => openSub(`protokolle/${d.day}`)}
            />
          ))}
        </Group>
      ))}
    </Screen>
  );
}
