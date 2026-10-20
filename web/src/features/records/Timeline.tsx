// Chronik: alle Ereignisse von der Welpenzeit bis heute, neueste zuerst, nach Monaten gegliedert.

import { useMemo, useState } from "react";
import type { TimelineEvent } from "@shared/types.ts";
import { fmtDM, fmtMonth, isValidDay, isValidHm, todayKey } from "@shared/dates.ts";
import { useDocs, useEvents, saveEvent, deleteEvent } from "../../lib/data";
import { newId } from "../../lib/store";
import { Sheet, useConfirm, useSheets } from "../../ui/overlays";
import { Chips, Field, TextField, AreaField } from "../../ui/controls";
import { Icon } from "../../ui/Icon";
import { Empty } from "../common";

const CATS: [string, string][] = [
  ["klinik", "Klinik"],
  ["diagnostik", "Untersuchung"],
  ["therapie", "Behandlung"],
  ["symptom", "Symptom"],
  ["verlauf", "Verlauf"],
  ["familie", "Familie"],
];
const CAT_TEXT = Object.fromEntries(CATS) as Record<string, string>;

export function TimelinePanel({ onDoc }: { onDoc: (id: string) => void }) {
  const events = useEvents();
  const docs = useDocs();
  const sheets = useSheets();
  const [filter, setFilter] = useState<string | null>(null);
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
  const edit = (e: TimelineEvent | null) => sheets.open((close) => <EventSheet event={e} onClose={close} />);
  return (
    <div className="stack">
      <button className="btn primary" onClick={() => edit(null)}>
        <Icon name="plus" size={20} /> Ereignis eintragen
      </button>
      {events.length ? <Chips options={CATS} value={filter} onChange={setFilter} small /> : null}
      {!events.length ? (
        <div className="card">
          <Empty title="Noch keine Chronik">
            <p>Die Chronik kommt mit dem Import der Akte; neue Befunde ergänzen sie beim Auslesen.</p>
          </Empty>
        </div>
      ) : (
        <div className="card">
          <div className="tl">
            {months.map((m) => (
              <div key={m.key}>
                <div className="tl-month">{fmtMonth(`${m.key}-01`)}</div>
                {m.items.map((e) => {
                  const doc = e.document_id ? docs.find((d) => d.id === e.document_id) : null;
                  return (
                    <div key={e.id} className={`tl-item ${e.category}`}>
                      <button className="link-btn" style={{ padding: 0, color: "inherit", textAlign: "left", fontWeight: 400, width: "100%" }} onClick={() => edit(e)}>
                        <span className="d">
                          {fmtDM(e.date)}
                          {e.date.slice(0, 4) !== todayKey().slice(0, 4) ? e.date.slice(0, 4) : ""}
                          {e.time ? ` · ${e.time}` : ""} · {CAT_TEXT[e.category] || e.category}
                        </span>
                        <b>{e.title}</b>
                        {e.text ? <p>{e.text}</p> : null}
                      </button>
                      {doc ? (
                        <button className="link-btn" onClick={() => onDoc(doc.id)}>
                          {doc.title}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventSheet({ event, onClose }: { event: TimelineEvent | null; onClose: () => void }) {
  const confirm = useConfirm();
  const [date, setDate] = useState(event?.date || todayKey());
  const [time, setTime] = useState(event?.time || "");
  const [title, setTitle] = useState(event?.title || "");
  const [text, setText] = useState(event?.text || "");
  const [cat, setCat] = useState(event?.category || "verlauf");
  const valid = isValidDay(date) && title.trim().length > 0;
  const save = () => {
    if (!valid) return;
    saveEvent({ id: event?.id || newId(), date, time: isValidHm(time) ? time : null, title: title.trim(), text: text.trim() || null, category: cat, document_id: event?.document_id || null });
    onClose();
  };
  return (
    <Sheet
      title={event ? "Ereignis bearbeiten" : "Ereignis eintragen"}
      onClose={onClose}
      footer={
        <>
          {event ? (
            <button
              className="btn danger"
              onClick={async () => {
                if (await confirm({ title: "Ereignis löschen?", text: event.title, confirm: "Löschen", danger: true })) {
                  deleteEvent(event.id);
                  onClose();
                }
              }}
            >
              Löschen
            </button>
          ) : (
            <button className="btn ghost" onClick={onClose}>
              Abbrechen
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={!valid} style={{ flex: 2 }}>
            Speichern
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div className="field">
          <label htmlFor="ev-date">Datum</label>
          <input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-time">Uhrzeit (optional)</label>
          <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <TextField label="Was" value={title} onChange={setTitle} placeholder="z. B. Kontrolltermin in der Klinik" />
      <AreaField label="Details" value={text} onChange={setText} rows={4} />
      <Field label="Art">
        <Chips options={CATS} value={cat} onChange={(v) => setCat(v || cat)} allowEmpty={false} />
      </Field>
    </Sheet>
  );
}
