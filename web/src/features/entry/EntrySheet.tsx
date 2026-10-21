// Eingabeblatt wie in Health: X und Haken oben, Symbol und Titel, darunter Datum, Zeit und Wert,
// weitere Angaben als Zeilen, Auswahl als Segmente oder Menü. Atemzüge mit Zähler.

import { useMemo, useState, type CSSProperties } from "react";
import { Sheet, useConfirm, useToast } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Icon } from "../../ui/Icon";
import { Group, Row, Segmented } from "../../ui/ios";
import { TYPES, entryAlert, fmtNum, num, type FieldDef, type Opt } from "@shared/entryTypes.ts";
import type { Entry, EntryType, Regimen } from "@shared/types.ts";
import { addDays, berlinNow, isValidDay, isValidHm } from "@shared/dates.ts";
import { autoSlot, itemsForDay } from "@shared/plan.ts";
import { dayStats } from "@shared/stats.ts";
import { deleteEntry, saveEntry } from "../../lib/data";
import { store } from "../../lib/store";
import { quickStyle } from "../../lib/health/entryStyle";
import { BreathCounter } from "./BreathCounter";

type Vals = Record<string, string | string[] | null>;

const memKey = (type: EntryType, k: string) => `spotty-last-${type}-${k}`;

function remembered(type: EntryType, k: string): string | null {
  try {
    return localStorage.getItem(memKey(type, k));
  } catch {
    return null;
  }
}

function initialVals(type: EntryType, entry?: Entry | null, preset?: Record<string, unknown>): Vals {
  const v: Vals = {};
  for (const f of TYPES[type].fields) {
    const raw = entry?.data?.[f.k] ?? (entry ? undefined : preset?.[f.k]);
    const last = !entry && f.remember ? remembered(type, f.k) : null;
    if (raw !== undefined && raw !== null) {
      v[f.k] = Array.isArray(raw) ? (raw as string[]) : f.t === "num" ? String(raw).replace(".", ",") : String(raw);
    } else if (last) {
      v[f.k] = last;
    } else if (f.def !== undefined) {
      v[f.k] = String(f.def);
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
  if (type === "notiz" && !data.text && !data.befinden && !(Array.isArray(data.tags) && data.tags.length)) return { data, error: "Bitte eine Beobachtung eintragen oder auswählen." };
  if (type === "kot" && Object.keys(data).length === 0) return { data, error: "Bitte mindestens Beschaffenheit oder Farbe wählen." };
  return { data, error: null };
}

const optVal = (o: Opt) => (Array.isArray(o) ? o[0] : o);
const optText = (o: Opt) => (Array.isArray(o) ? o[1] : o);

/** Zwei oder drei kurze Möglichkeiten passen als Segmente nebeneinander. */
function asSegments(f: FieldDef): boolean {
  const opts = f.opts || [];
  if (opts.length < 2 || opts.length > 3) return false;
  const total = opts.reduce((a, o) => a + optText(o).length, 0);
  return total <= (opts.length === 2 ? 30 : 26);
}

export interface EntrySheetProps {
  type: EntryType;
  day: string;
  slot?: string | null;
  entry?: Entry | null;
  startCounter?: boolean;
  /** Vorbelegung für neue Einträge, z. B. eine Schnellauswahl */
  preset?: Record<string, unknown>;
  onClose: () => void;
}

export function EntrySheet({ type, day, slot, entry, startCounter, preset, onClose }: EntrySheetProps) {
  const def = TYPES[type];
  const toast = useToast();
  const confirm = useConfirm();
  const style = quickStyle(type);
  const [vals, setVals] = useState<Vals>(() => initialVals(type, entry, preset));
  const [time, setTime] = useState<string>(() => entry?.time || berlinNow().hm);
  const [date, setDate] = useState<string>(() => entry?.day || day);
  const [error, setError] = useState<string | null>(null);
  const [counter, setCounter] = useState<boolean>(!!startCounter && type === "atem" && !entry);
  const set = (k: string, v: string | string[] | null) => {
    setError(null);
    setVals((s) => ({ ...s, [k]: v }));
  };

  const preview = useMemo(() => {
    const { data } = validate(type, vals);
    return entryAlert({ type, data });
  }, [type, vals]);
  const required = def.fields.filter((f) => f.req);
  const ready = required.every((f) => (f.t === "num" ? num(vals[f.k]) !== null : typeof vals[f.k] === "string" && (vals[f.k] as string).trim())) && isValidHm(time) && isValidDay(date);

  const save = () => {
    const { data, error: err } = validate(type, vals);
    if (err) {
      setError(err);
      return;
    }
    if (!isValidHm(time) || !isValidDay(date)) {
      setError("Bitte Datum und Uhrzeit prüfen.");
      return;
    }
    let useSlot: string | null = entry && entry.day === date ? (entry.slot ?? null) : date === day ? (slot ?? null) : null;
    if (!useSlot && def.measure) {
      const regs = store.rows<Regimen>("regimens");
      const items = itemsForDay(regs, date);
      const taken = new Set(store.rows<Entry>("entries").filter((e) => e.day === date && e.slot && e.id !== entry?.id).map((e) => e.slot as string));
      useSlot = autoSlot(items, def.measure, time, taken);
    }
    saveEntry({ id: entry?.id, type, day: date, time, data, slot: useSlot, ack: entry?.ack ?? false });
    for (const f of def.fields) {
      // Nur neue Einträge prägen die Vorbelegung; das Bearbeiten alter Einträge lässt sie unverändert.
      if (!f.remember || entry) continue;
      try {
        if (typeof data[f.k] === "string") localStorage.setItem(memKey(type, f.k), data[f.k] as string);
        else localStorage.removeItem(memKey(type, f.k));
      } catch {
        /* Speicher gesperrt */
      }
    }
    let msg = `${def.short} gespeichert`;
    if (type === "atem" && typeof data.bpm === "number") {
      const y = dayStats(store.rows<Entry>("entries"), addDays(date, -1));
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

  const main = def.fields.find((f) => f.t === "num") || null;
  const note = def.fields.find((f) => f.k === "text" && f.t === "text") || null;
  const rest = def.fields.filter((f) => f !== main && f !== note);

  const numRow = (f: FieldDef, isMain = false) => {
    const text = (vals[f.k] as string) || "";
    return (
      <Row
        key={f.k}
        title={isMain && f.unit && f.unit !== "×" ? (type === "atem" ? "Atemzüge/min" : f.unit === "/min" ? f.label : f.unit) : f.unit ? `${f.label} (${f.unit})` : f.label}
        accessory={
          <input
            className="row-input num"
            type="text"
            inputMode={f.dec ? "decimal" : "numeric"}
            value={text}
            placeholder={isMain ? "Wert" : "–"}
            onChange={(e) => set(f.k, e.target.value.replace(/[^0-9.,]/g, ""))}
            aria-label={f.unit ? `${f.label} in ${f.unit}` : f.label}
            autoFocus={isMain && !entry && !counter && type !== "atem"}
          />
        }
      />
    );
  };

  const fieldBlock = (f: FieldDef) => {
    const v = vals[f.k];
    if (f.t === "num") return <Group key={f.k}>{numRow(f)}</Group>;
    if (f.t === "chips" && asSegments(f)) {
      const opts = f.opts || [];
      return (
        <Group key={f.k} header={f.label}>
          <div className="grp-pad">
            <Segmented<string>
              label={f.label}
              value={(v as string) || ""}
              onChange={(nv) => set(f.k, v === nv && f.def === undefined ? null : nv)}
              options={opts.map((o) => [optVal(o), optText(o)] as [string, string])}
            />
          </div>
        </Group>
      );
    }
    if (f.t === "chips") {
      const opts = f.opts || [];
      return (
        <Group key={f.k}>
          <Row
            title={f.label}
            accessory={
              <span className="row-select-w">
                <select className="row-select" value={(v as string) || ""} onChange={(e) => set(f.k, e.target.value || null)} aria-label={f.label}>
                  {f.def === undefined ? <option value="">Auswählen</option> : null}
                  {opts.map((o) => (
                    <option key={optVal(o)} value={optVal(o)}>
                      {optText(o)}
                    </option>
                  ))}
                </select>
                <Icon name="updown" size={15} stroke={2.4} />
              </span>
            }
          />
        </Group>
      );
    }
    if (f.t === "multi") {
      const cur = (v as string[]) || [];
      return (
        <Group key={f.k} header={f.label}>
          {(f.opts || []).map((o) => {
            const ov = optVal(o);
            const on = cur.includes(ov);
            return (
              <Row
                key={ov}
                title={optText(o)}
                pressed={on}
                onClick={() => set(f.k, on ? cur.filter((x) => x !== ov) : [...cur, ov])}
                accessory={
                  on ? (
                    <span className="row-check" aria-label="gewählt">
                      <Icon name="check" size={18} stroke={2.8} />
                    </span>
                  ) : null
                }
              />
            );
          })}
        </Group>
      );
    }
    if (f.t === "area")
      return (
        <Group key={f.k} header={f.label}>
          <textarea className="grp-area" rows={4} value={(v as string) || ""} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} aria-label={f.label} />
        </Group>
      );
    return (
      <Group key={f.k}>
        <Row title={f.label} accessory={<input className="row-input" type="text" value={(v as string) || ""} placeholder={f.ph || "optional"} onChange={(e) => set(f.k, e.target.value)} aria-label={f.label} />} />
      </Group>
    );
  };

  const bpm = type === "atem" ? num(vals.bpm) : null;

  return (
    <Sheet title={entry ? `${def.label} bearbeiten` : def.label} onClose={onClose} onDone={save} doneDisabled={!ready} doneLabel={bpm != null ? `${fmtNum(bpm)}/min speichern` : "Speichern"} hideTitle tall>
      <div className="entry-hero" style={{ "--cat": style.color } as CSSProperties}>
        <span className="entry-ic" aria-hidden="true">
          <Glyph name={style.glyph} size={44} />
        </span>
        <p className="entry-title">{def.label}</p>
      </div>

      {main?.counter && counter ? (
        <div className="counter-wrap">
          <BreathCounter onResult={(n) => set(main.k, String(n))} />
          <button type="button" className="link-c" onClick={() => setCounter(false)}>
            Wert selbst eintragen
          </button>
        </div>
      ) : null}

      <Group footer={def.hint && !(type === "atem" && counter) ? def.hint : undefined}>
        <Row title="Datum" accessory={<input className="cap-input" type="date" value={date} max={berlinNow().day} onChange={(e) => setDate(e.target.value)} aria-label="Datum" />} />
        <Row title="Zeit" accessory={<input className="cap-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Uhrzeit" />} />
        {main ? numRow(main, true) : null}
        {main?.counter && !counter ? <Row icon="lungs" color="var(--blue)" title="Mit dem Zähler zählen" tone="blue" onClick={() => setCounter(true)} /> : null}
      </Group>

      {main?.presets ? (
        <div className="presets" role="group" aria-label="Schnellwahl">
          {main.presets.map(([n, label]) => (
            <button key={n} type="button" className={`preset${num(vals[main.k]) === n ? " on" : ""}`} aria-pressed={num(vals[main.k]) === n} onClick={() => set(main.k, String(n))}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {rest.map(fieldBlock)}
      {note ? fieldBlock(note) : null}

      {preview ? (
        <div className={`inline-alert ${preview.level}`} role="status">
          <Glyph name="alert" size={22} />
          <p>{preview.text}</p>
        </div>
      ) : null}
      {error ? <p className="sheet-error">{error}</p> : null}

      {entry ? (
        <Group>
          <Row title="Eintrag löschen" tone="red" onClick={() => void remove()} />
        </Group>
      ) : null}
    </Sheet>
  );
}
