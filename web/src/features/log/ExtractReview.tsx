// Prüfen und Übernehmen der von Claude gelesenen Protokollzeilen.

import { useMemo, useState } from "react";
import { Sheet, useToast } from "../../ui/overlays";
import type { ProtocolExtraction } from "../../lib/photos";
import { TYPES, summarize } from "@shared/entryTypes.ts";
import type { Entry, EntryType, Photo, Regimen } from "@shared/types.ts";
import { isValidHm } from "@shared/dates.ts";
import { itemsForDay } from "@shared/plan.ts";
import { checkItem, saveEntry, savePhoto } from "../../lib/data";
import { store } from "../../lib/store";
import { matchRegimen } from "../../lib/medmatch";

interface Row {
  key: string;
  kind: "entry" | "check" | "med";
  time: string;
  label: string;
  text: string;
  original: string;
  unsure: boolean;
  dup: boolean;
  on: boolean;
  entry?: { type: EntryType; data: Record<string, unknown> };
  slot?: string;
}

const VALID = new Set(Object.keys(TYPES));

export function ExtractReview({ photo, result, onClose }: { photo: Photo; result: ProtocolExtraction; onClose: () => void }) {
  const toast = useToast();
  const initial = useMemo<Row[]>(() => {
    const existing = store.rows<Entry>("entries").filter((e) => e.day === photo.day);
    const rows: Row[] = [];
    (result.eintraege || []).forEach((e, i) => {
      if (!VALID.has(e.type) || !isValidHm(e.time)) return;
      const type = e.type as EntryType;
      const dup = existing.some((x) => x.type === type && x.time === e.time);
      rows.push({
        key: `e${i}`,
        kind: "entry",
        time: e.time,
        label: TYPES[type].short,
        text: summarize({ type, data: e.data || {} }),
        original: e.original,
        unsure: !!e.unsicher,
        dup,
        on: !e.unsicher && !dup,
        entry: { type, data: e.data || {} },
      });
    });
    const regs = store.rows<Regimen>("regimens");
    const items = itemsForDay(regs, photo.day);
    const usedSlots = new Set<string>();
    (result.medikamente || []).forEach((m, i) => {
      if (!isValidHm(m.time)) return;
      const reg = matchRegimen(regs, m.name);
      // passenden, noch freien Planpunkt mit der geringsten Zeitabweichung suchen
      let slot: string | undefined;
      if (reg) {
        const cands = items.filter((it) => it.regimenId === reg.id && !usedSlots.has(it.slot));
        cands.sort((a, b) => Math.abs(toMin(a.time) - toMin(m.time)) - Math.abs(toMin(b.time) - toMin(m.time)));
        if (cands[0] && Math.abs(toMin(cands[0].time) - toMin(m.time)) <= 240) slot = cands[0].slot;
      }
      if (slot) {
        usedSlots.add(slot);
        const done = !!store.find("checks", { day: photo.day, slot });
        rows.push({ key: `m${i}`, kind: "check", time: m.time, label: "Plan", text: `${m.name}${m.menge ? ` ${m.menge}` : ""} → abhaken`, original: m.original, unsure: false, dup: done, on: !done, slot });
      } else {
        rows.push({ key: `m${i}`, kind: "med", time: m.time, label: "Medikament", text: `${m.name}${m.menge ? ` ${m.menge}` : ""}`, original: m.original, unsure: false, dup: false, on: true, entry: { type: "med", data: { name: m.name, dosis: m.menge || undefined } } });
      }
    });
    return rows.sort((a, b) => toMin(a.time) - toMin(b.time));
  }, [photo, result]);
  const [rows, setRows] = useState<Row[]>(initial);
  const count = rows.filter((r) => r.on).length;

  const apply = () => {
    let n = 0;
    for (const r of rows) {
      if (!r.on) continue;
      if (r.kind === "check" && r.slot) {
        checkItem(photo.day, r.slot, r.time);
        n++;
      } else if (r.entry) {
        const data = { ...r.entry.data };
        for (const k of Object.keys(data)) if (data[k] === null || data[k] === "") delete data[k];
        saveEntry({ type: r.entry.type, day: photo.day, time: r.time, data, source: "foto" });
        n++;
      }
    }
    savePhoto({ ...photo, extraction: { at: new Date().toISOString(), uebernommen: n, hinweise: result.hinweise || null } });
    toast.show(`${n} Einträge übernommen`);
    onClose();
  };

  return (
    <Sheet
      title="Vom Foto gelesen"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Verwerfen
          </button>
          <button className="btn primary" onClick={apply} disabled={!count} style={{ flex: 2 }}>
            {count} übernehmen
          </button>
        </>
      }
    >
      <p className="hint">Claude hat das Blatt Zeile für Zeile gelesen. Bitte prüfen: Häkchen setzen, was übernommen werden soll. Unsichere oder schon vorhandene Zeilen sind abgewählt.</p>
      {result.hinweise ? (
        <div className="banner info">
          <div className="head">Hinweise von Claude</div>
          <p>{result.hinweise}</p>
        </div>
      ) : null}
      {!rows.length ? <p>Keine Einträge erkannt.</p> : null}
      <div className="card flush">
        {rows.map((r) => (
          <label key={r.key} className="erow" style={{ gridTemplateColumns: "28px 48px minmax(0,1fr)", cursor: "pointer" }}>
            <input type="checkbox" checked={r.on} onChange={(e) => setRows((s) => s.map((x) => (x.key === r.key ? { ...x, on: e.target.checked } : x)))} style={{ width: 22, height: 22, marginTop: 2 }} />
            <span className="t">{r.time}</span>
            <span>
              <span className="ty">
                {r.label}
                {r.unsure ? " · unsicher" : ""}
                {r.dup ? " · schon eingetragen" : ""}
              </span>
              <span className="s" style={{ display: "block" }}>
                {r.text}
              </span>
              <span className="x" style={{ display: "block" }}>
                „{r.original}“
              </span>
            </span>
          </label>
        ))}
      </div>
    </Sheet>
  );
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
