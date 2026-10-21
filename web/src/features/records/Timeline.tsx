// Chronik: alle Ereignisse von der Welpenzeit bis heute, neueste zuerst, nach Monaten gegliedert.
// Aufbau wie die Listen in Health: je Monat eine Gruppe, je Ereignis eine Zeile mit Symbol der Art.

import { useMemo, useState, type CSSProperties } from "react";
import type { TimelineEvent } from "@shared/types.ts";
import { fmtDM, fmtMonth, isValidDay, isValidHm, todayKey } from "@shared/dates.ts";
import { useDocs, useEvents, saveEvent, deleteEvent } from "../../lib/data";
import { newId } from "../../lib/store";
import { Sheet, useConfirm, useToast } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Icon } from "../../ui/Icon";
import { EmptyCard, Group, Row } from "../../ui/ios";

export const EVENT_CATS: [string, string][] = [
  ["klinik", "Klinik"],
  ["diagnostik", "Untersuchung"],
  ["therapie", "Behandlung"],
  ["symptom", "Symptom"],
  ["verlauf", "Verlauf"],
  ["familie", "Familie"],
];
const CAT_TEXT = Object.fromEntries(EVENT_CATS) as Record<string, string>;

const CAT_STYLE: Record<string, { glyph: string; color: string }> = {
  klinik: { glyph: "bandage", color: "var(--red)" },
  diagnostik: { glyph: "flask", color: "var(--purple)" },
  therapie: { glyph: "capsule", color: "var(--c-medikamente)" },
  symptom: { glyph: "symptom", color: "var(--c-symptome)" },
  verlauf: { glyph: "trend", color: "var(--blue)" },
  familie: { glyph: "people", color: "var(--c-befinden)" },
};

function styleOfEvent(cat: string) {
  return CAT_STYLE[cat] || { glyph: "calendar", color: "var(--gray)" };
}

export function TimelineList({ onDoc, onEdit }: { onDoc: (id: string) => void; onEdit: (e: TimelineEvent) => void }) {
  const events = useEvents();
  const docs = useDocs();
  const [filter, setFilter] = useState<string | null>(null);
  const thisYear = todayKey().slice(0, 4);
  const sorted = useMemo(
    () => [...events].filter((e) => !filter || e.category === filter).sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "")),
    [events, filter],
  );
  const months: { key: string; items: TimelineEvent[] }[] = [];
  for (const e of sorted) {
    const k = e.date.slice(0, 7);
    if (!months.length || months[months.length - 1].key !== k) months.push({ key: k, items: [] });
    months[months.length - 1].items.push(e);
  }
  const present = new Set(events.map((e) => e.category));
  const cats = EVENT_CATS.filter(([k]) => present.has(k));

  if (!events.length) return <EmptyCard title="Noch keine Chronik">Die Chronik kommt mit dem Import der Akte; neue Befunde ergänzen sie beim Auslesen.</EmptyCard>;

  return (
    <>
      {cats.length > 1 ? (
        <div className="fchips" role="group" aria-label="Nach Art filtern">
          <button type="button" className="fchip" aria-pressed={filter === null} onClick={() => setFilter(null)}>
            Alle
          </button>
          {cats.map(([k, label]) => (
            <button key={k} type="button" className="fchip" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {months.map((m) => (
        <Group key={m.key} header={fmtMonth(`${m.key}-01`)}>
          {m.items.map((e) => {
            const st = styleOfEvent(e.category);
            const doc = e.document_id ? docs.find((d) => d.id === e.document_id) : null;
            const when = `${fmtDM(e.date)}${e.date.slice(0, 4) !== thisYear ? e.date.slice(0, 4) : ""}${e.time ? ` · ${e.time}` : ""} · ${CAT_TEXT[e.category] || e.category}`;
            return (
              <div key={e.id} className="tl2">
                <button type="button" className="lrow tl2-row" onClick={() => onEdit(e)} style={{ "--cat": st.color } as CSSProperties}>
                  <span className="row-ic" aria-hidden="true">
                    <Glyph name={st.glyph} size={24} />
                  </span>
                  <span className="row-t multi">
                    <span className="row-sub">{when}</span>
                    <span className="row-title">{e.title}</span>
                    {e.text ? <span className="tl2-text">{e.text}</span> : null}
                  </span>
                </button>
                {doc ? (
                  <button type="button" className="tl2-doc" onClick={() => onDoc(doc.id)}>
                    <Glyph name="doc" size={16} />
                    <span>{doc.title}</span>
                    <Icon name="right" size={13} stroke={2.6} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </Group>
      ))}
    </>
  );
}

export function EventSheet({ event, onClose }: { event: TimelineEvent | null; onClose: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [date, setDate] = useState(event?.date || todayKey());
  const [time, setTime] = useState(event?.time || "");
  const [title, setTitle] = useState(event?.title || "");
  const [text, setText] = useState(event?.text || "");
  const [cat, setCat] = useState(event?.category || "verlauf");
  const valid = isValidDay(date) && title.trim().length > 0;
  const st = styleOfEvent(cat);
  const save = () => {
    if (!valid) return;
    saveEvent({ id: event?.id || newId(), date, time: isValidHm(time) ? time : null, title: title.trim(), text: text.trim() || null, category: cat, document_id: event?.document_id || null });
    toast.show(event ? "Ereignis gespeichert" : "Ereignis eingetragen");
    onClose();
  };
  const remove = async () => {
    if (!event) return;
    if (await confirm({ title: "Ereignis löschen?", text: event.title, confirm: "Löschen", danger: true })) {
      deleteEvent(event.id);
      toast.show("Ereignis gelöscht");
      onClose();
    }
  };
  return (
    <Sheet title={event ? "Ereignis bearbeiten" : "Ereignis eintragen"} onClose={onClose} onDone={save} doneDisabled={!valid} doneLabel="Speichern" tall>
      <div className="entry-hero" style={{ "--cat": st.color } as CSSProperties}>
        <span className="entry-ic" aria-hidden="true">
          <Glyph name={st.glyph} size={44} />
        </span>
        <p className="entry-title">{event ? "Ereignis" : "Neues Ereignis"}</p>
      </div>
      <Group>
        <Row title="Datum" accessory={<input className="cap-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" />} />
        <Row title="Uhrzeit" accessory={<input className="cap-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Uhrzeit (optional)" />} />
        <Row
          title="Art"
          accessory={
            <span className="row-select-w">
              <select className="row-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Art">
                {EVENT_CATS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <Icon name="updown" size={15} stroke={2.4} />
            </span>
          }
        />
      </Group>
      <Group header="Was">
        <input className="grp-input" type="text" value={title} placeholder="z. B. Kontrolltermin in der Klinik" onChange={(e) => setTitle(e.target.value)} aria-label="Was" />
      </Group>
      <Group header="Details">
        <textarea className="grp-area" rows={5} value={text} placeholder="optional" onChange={(e) => setText(e.target.value)} aria-label="Details" />
      </Group>
      {event ? (
        <Group>
          <Row title="Ereignis löschen" tone="red" onClick={() => void remove()} />
        </Group>
      ) : null}
    </Sheet>
  );
}
