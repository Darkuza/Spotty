// Eingabemaske für einen Protokolleintrag (alle Typen), inklusive Atemzähler.

import { useMemo, useState } from "react";
import { Sheet, useConfirm, useToast } from "../../ui/overlays";
import { Chips, Field, MultiChips, NumberInput } from "../../ui/controls";
import { TYPES, entryAlert, fmtNum, num, type FieldDef } from "@shared/entryTypes.ts";
import type { Entry, EntryType, Regimen } from "@shared/types.ts";
import { addDays, berlinNow, isValidHm } from "@shared/dates.ts";
import { autoSlot, itemsForDay } from "@shared/plan.ts";
import { dayStats } from "@shared/stats.ts";
import { deleteEntry, saveEntry } from "../../lib/data";
import { store } from "../../lib/store";
import { BreathCounter } from "./BreathCounter";
import { Icon } from "../../ui/Icon";

type Vals = Record<string, string | string[] | null>;

const memKey = (type: EntryType, k: string) => `spotty-last-${type}-${k}`;

function remembered(type: EntryType, k: string): string | null {
  try {
    return localStorage.getItem(memKey(type, k));
  } catch {
    return null;
  }
}

function initialVals(type: EntryType, entry?: Entry | null): Vals {
  const v: Vals = {};
  for (const f of TYPES[type].fields) {
    const raw = entry?.data?.[f.k];
    const last = !entry && f.remember ? remembered(type, f.k) : null;
    if (raw !== undefined && raw !== null) {
      v[f.k] = Array.isArray(raw) ? (raw as string[]) : f.t === "num" ? String(raw).replace(".", ",") : String(raw);
    } else if (last) {
      v[f.k] = last;
    } else if (f.def !== undefined) {
      v[f.k] = f.t === "num" ? String(f.def) : String(f.def);
    } else v[f.k] = f.t === "multi" ? [] : null;
  }
  return v;
}

function validate(type: EntryType, vals: Vals): { data: Record<string, unknown>; error: string | null } {
  const data: Record<string, unknown> = {};
  for (const f of TYPES[type].fields) {
    const v = vals[f.k];
    if (f.t === "num") {
      const n = num(v);
      if (n === null) {
        if (f.req) return { data, error: `Bitte „${f.label}“ eintragen.` };
        continue;
      }
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return { data, error: `„${f.label}“ liegt außerhalb von ${f.min}–${f.max}.` };
      data[f.k] = f.dec ? Math.round(n * Math.pow(10, f.dec)) / Math.pow(10, f.dec) : Math.round(n * 10) / 10;
    } else if (f.t === "multi") {
      if (Array.isArray(v) && v.length) data[f.k] = v;
    } else {
      const s = typeof v === "string" ? v.trim() : "";
      if (!s) {
        if (f.req) return { data, error: `Bitte „${f.label}“ ausfüllen.` };
        continue;
      }
      data[f.k] = s;
    }
  }
  if (type === "notiz" && !data.text && !(Array.isArray(data.tags) && data.tags.length)) return { data, error: "Bitte eine Beobachtung eintragen oder auswählen." };
  if (type === "kot" && Object.keys(data).length === 0) return { data, error: "Bitte mindestens Beschaffenheit oder Farbe wählen." };
  return { data, error: null };
}

export interface EntrySheetProps {
  type: EntryType;
  day: string;
  slot?: string | null;
  entry?: Entry | null;
  startCounter?: boolean;
  onClose: () => void;
}

export function EntrySheet({ type, day, slot, entry, startCounter, onClose }: EntrySheetProps) {
  const def = TYPES[type];
  const toast = useToast();
  const confirm = useConfirm();
  const [vals, setVals] = useState<Vals>(() => initialVals(type, entry));
  const [time, setTime] = useState<string>(() => entry?.time || berlinNow().hm);
  const [error, setError] = useState<string | null>(null);
  const [counter, setCounter] = useState<boolean>(!!startCounter && type === "atem" && !entry);
  const set = (k: string, v: string | string[] | null) => setVals((s) => ({ ...s, [k]: v }));

  const preview = useMemo(() => {
    const { data } = validate(type, vals);
    return entryAlert({ type, data });
  }, [type, vals]);

  const save = () => {
    const { data, error: err } = validate(type, vals);
    if (err) {
      setError(err);
      return;
    }
    if (!isValidHm(time)) {
      setError("Bitte eine gültige Uhrzeit eintragen.");
      return;
    }
    let useSlot = entry?.slot ?? slot ?? null;
    if (!useSlot && def.measure) {
      const regs = store.rows<Regimen>("regimens");
      const items = itemsForDay(regs, day);
      const taken = new Set(store.rows<Entry>("entries").filter((e) => e.day === day && e.slot && e.id !== entry?.id).map((e) => e.slot as string));
      useSlot = autoSlot(items, def.measure, time, taken);
    }
    saveEntry({ id: entry?.id, type, day, time, data, slot: useSlot, ack: entry?.ack ?? false });
    for (const f of def.fields) {
      if (!f.remember) continue;
      try {
        if (typeof data[f.k] === "string") localStorage.setItem(memKey(type, f.k), data[f.k] as string);
      } catch {
        /* Speicher gesperrt */
      }
    }
    let msg = `${def.short} gespeichert`;
    if (type === "atem" && typeof data.bpm === "number") {
      const y = dayStats(store.rows<Entry>("entries"), addDays(day, -1));
      msg = `${fmtNum(data.bpm as number)}/min gespeichert${y.atemWert != null ? ` · gestern Tageswert ${fmtNum(y.atemWert)}` : ""}`;
    }
    toast.show(msg);
    onClose();
  };

  const remove = async () => {
    if (!entry) return;
    const ok = await confirm({ title: "Eintrag löschen?", text: "Der Eintrag wird für alle gelöscht.", confirm: "Löschen", danger: true });
    if (ok) {
      deleteEntry(entry.id);
      toast.show("Eintrag gelöscht");
      onClose();
    }
  };

  const renderField = (f: FieldDef) => {
    const v = vals[f.k];
    if (f.t === "num") {
      return (
        <Field key={f.k} label={f.label}>
          <div className="row">
            <NumberInput value={(v as string) || ""} onChange={(nv) => set(f.k, nv)} unit={f.unit} dec={f.dec} />
            {f.counter ? (
              <button type="button" className="btn ghost small" onClick={() => setCounter((c) => !c)}>
                {counter ? "Zähler ausblenden" : "Zählen"}
              </button>
            ) : null}
          </div>
          {f.presets ? (
            <div className="chips">
              {f.presets.map(([n, label]) => (
                <button key={n} type="button" className="chip small" aria-pressed={num(v) === n} onClick={() => set(f.k, String(n))}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {f.counter && counter ? (
            <BreathCounter
              onResult={(bpm) => {
                set(f.k, String(bpm));
              }}
            />
          ) : null}
        </Field>
      );
    }
    if (f.t === "chips")
      return (
        <Field key={f.k} label={f.label}>
          <Chips options={f.opts || []} value={(v as string) ?? null} onChange={(nv) => set(f.k, nv)} />
        </Field>
      );
    if (f.t === "multi")
      return (
        <Field key={f.k} label={f.label}>
          <MultiChips options={f.opts || []} value={(v as string[]) || []} onChange={(nv) => set(f.k, nv)} />
        </Field>
      );
    if (f.t === "area")
      return (
        <div key={f.k} className="field">
          <label htmlFor={`f-${f.k}`}>{f.label}</label>
          <textarea id={`f-${f.k}`} rows={4} value={(v as string) || ""} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} />
        </div>
      );
    return (
      <div key={f.k} className="field">
        <label htmlFor={`f-${f.k}`}>{f.label}</label>
        <input id={`f-${f.k}`} type="text" value={(v as string) || ""} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} />
      </div>
    );
  };

  return (
    <Sheet
      title={entry ? `${def.label} bearbeiten` : def.label}
      onClose={onClose}
      footer={
        <>
          {entry ? (
            <button className="btn danger" onClick={remove} aria-label="Eintrag löschen">
              <Icon name="trash" size={20} />
            </button>
          ) : null}
          <button className="btn primary" onClick={save} style={{ flex: 3 }}>
            Speichern
          </button>
        </>
      }
    >
      {def.hint ? <p className="hint">{def.hint}</p> : null}
      {def.fields.map(renderField)}
      <div className="field">
        <label htmlFor="entry-time">Uhrzeit</label>
        <input id="entry-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ maxWidth: 160 }} />
      </div>
      {preview ? (
        <div className={`banner ${preview.level}`}>
          <div className="head">
            <Icon name="alert" size={20} /> Hinweis
          </div>
          <p>{preview.text}</p>
        </div>
      ) : null}
      {error ? (
        <p className="hint" style={{ color: "var(--danger)", fontWeight: 600 }}>
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
