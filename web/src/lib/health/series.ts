// Messreihen für die Messwertseiten: Einzelwerte aus dem Protokoll, Tageswerte, Zeiträume (T, W, M, 6 M., J)
// und die Kopfzahl darüber. Reine Funktionen, damit sie sich testen lassen.

import type { Check, DayNote, Entry, Photo, Regimen } from "@shared/types.ts";
import { num } from "@shared/entryTypes.ts";
import { addDays, dayRange, minutesOf, parseDay, pad, weekday, type BerlinNow } from "@shared/dates.ts";
import { median } from "@shared/stats.ts";
import { itemGiven, itemsForDay } from "@shared/plan.ts";
import type { MetricDef, StateDef } from "./metrics";
import { MONTH_INITIAL, MONTH_SHORT, fmt, fmtDate, fmtDateWd, fmtMax, fmtMonthSpan, fmtSpan } from "./format";

export interface PlanDay {
  due: number;
  given: number;
}

export interface Sources {
  entries: Entry[];
  notes: DayNote[];
  photos: Photo[];
  /** Gewichte aus der Akte */
  weights: { date: string; kg: number }[];
  /** Planstand je Tag, nur für den Messwert „plan“ */
  plan?: Map<string, PlanDay>;
}

export interface Sample {
  day: string;
  time: string;
  v: number;
  /** Zählung nach Bewegung: sichtbar, aber nicht im Bereich */
  hollow?: boolean;
  /** Stufe bei Einschätzungen bzw. Zustand bei Atemzügen */
  s?: string;
  /** Tagessumme vom Papierprotokoll */
  paper?: boolean;
  entry?: Entry;
  photo?: Photo;
}

function data(e: Entry): Record<string, unknown> {
  return (e.data || {}) as Record<string, unknown>;
}

function byTime(a: Sample, b: Sample): number {
  return a.day === b.day ? minutesOf(a.time) - minutesOf(b.time) : a.day < b.day ? -1 : 1;
}

function stateLevel(states: StateDef[] | undefined, v: string): number {
  return states?.find((s) => s.v === v)?.level ?? 1;
}

/** Alle Einzelwerte eines Messwerts, zeitlich sortiert. */
export function samplesOf(def: MetricDef, src: Sources): Sample[] {
  const out: Sample[] = [];
  const add = (e: Entry, v: number | null, extra: Partial<Sample> = {}) => {
    if (v !== null && isFinite(v)) out.push({ day: e.day, time: e.time, v, entry: e, ...extra });
  };
  switch (def.id) {
    case "atem":
      for (const e of src.entries) if (e.type === "atem") add(e, num(data(e).bpm), { hollow: data(e).zustand === "aktiv", s: String(data(e).zustand || "") });
      break;
    case "spo2":
      for (const e of src.entries) if (e.type === "spo2" && data(e).pulsOk !== "nein") add(e, num(data(e).pct));
      break;
    case "puls":
      for (const e of src.entries) if (e.type === "spo2" && data(e).pulsOk !== "nein") add(e, num(data(e).puls));
      break;
    case "husten":
      for (const e of src.entries) if (e.type === "husten") add(e, num(data(e).anzahl) ?? 1);
      break;
    case "trinken":
    case "futter": {
      const type = def.id;
      const key = type === "trinken" ? "ml" : "g";
      const days = new Set<string>();
      for (const e of src.entries) {
        if (e.type !== type) continue;
        if (type === "futter" && data(e).reaktion === "abgelehnt") continue;
        const v = num(data(e)[key]);
        if (v !== null) {
          add(e, v);
          days.add(e.day);
        }
      }
      for (const n of src.notes) {
        const v = type === "trinken" ? n.paper_ml : n.paper_g;
        if (v !== null && v !== undefined && !days.has(n.day)) out.push({ day: n.day, time: "23:59", v, paper: true });
      }
      break;
    }
    case "gassi":
      for (const e of src.entries) if (e.type === "gassi") add(e, num(data(e).min) ?? 0);
      break;
    case "kot":
    case "urin":
    case "erbrechen":
    case "med":
      for (const e of src.entries) if (e.type === def.id) add(e, 1);
      break;
    case "notiz":
      for (const e of src.entries) {
        if (e.type !== "notiz") continue;
        const d = data(e);
        if ((typeof d.text === "string" && d.text.trim()) || (Array.isArray(d.tags) && d.tags.length)) add(e, 1);
      }
      break;
    case "gewicht": {
      const days = new Set<string>();
      for (const e of src.entries) {
        if (e.type !== "gewicht") continue;
        const v = num(data(e).kg);
        if (v !== null) {
          add(e, v);
          days.add(e.day);
        }
      }
      for (const w of src.weights) if (!days.has(w.date) && isFinite(w.kg)) out.push({ day: w.date, time: "12:00", v: w.kg });
      break;
    }
    case "nacht":
      for (const n of src.notes) if (n.nacht) out.push({ day: n.day, time: "07:00", v: stateLevel(def.states, n.nacht), s: n.nacht });
      break;
    case "befinden":
      for (const e of src.entries) {
        const b = data(e).befinden;
        if (e.type === "notiz" && typeof b === "string" && b) add(e, stateLevel(def.states, b), { s: b });
      }
      break;
    case "fotos":
      for (const p of src.photos) out.push({ day: p.day, time: p.time, v: 1, photo: p });
      break;
    case "plan":
      for (const [day, p] of src.plan || []) if (p.due > 0) out.push({ day, time: "23:59", v: (p.given / p.due) * 100 });
      break;
    default:
      if (def.tag) {
        for (const e of src.entries) {
          const tags = data(e).tags;
          if (e.type === "notiz" && Array.isArray(tags) && tags.includes(def.tag)) add(e, 1);
        }
      }
  }
  return out.sort(byTime);
}

export interface DayVal {
  day: string;
  /** Anzahl Einzelwerte */
  n: number;
  /** Summe (Mengen, Häufigkeiten) */
  total: number;
  /** Bereich ohne Zählungen nach Bewegung */
  lo: number | null;
  hi: number | null;
  /** Median des Bereichs */
  mid: number | null;
  last: Sample | null;
  states: string[];
  due?: number;
  given?: number;
}

/** Tageswerte aus den Einzelwerten. */
export function dayValues(def: MetricDef, samples: Sample[], plan?: Map<string, PlanDay>): Map<string, DayVal> {
  const map = new Map<string, DayVal>();
  if (def.agg === "plan") {
    for (const [day, p] of plan || []) {
      if (!p.due) continue;
      map.set(day, { day, n: p.due, total: p.given, lo: null, hi: null, mid: (p.given / p.due) * 100, last: null, states: [], due: p.due, given: p.given });
    }
    return map;
  }
  const groups = new Map<string, Sample[]>();
  for (const s of samples) {
    const g = groups.get(s.day);
    if (g) g.push(s);
    else groups.set(s.day, [s]);
  }
  for (const [day, list] of groups) {
    const rest = list.filter((s) => !s.hollow).map((s) => s.v);
    map.set(day, {
      day,
      n: list.length,
      total: list.reduce((a, s) => a + s.v, 0),
      lo: rest.length ? Math.min(...rest) : null,
      hi: rest.length ? Math.max(...rest) : null,
      mid: rest.length ? median(rest) : null,
      last: list[list.length - 1],
      states: list.map((s) => s.s || "").filter(Boolean),
    });
  }
  return map;
}

/** Hauptwert eines Tages, wie ihn Karten und Highlights zeigen. */
export function dayValueOf(def: MetricDef, dv: DayVal | undefined): number | null {
  if (!dv) return null;
  switch (def.agg) {
    case "sum":
    case "count":
      return dv.total;
    case "range":
      return dv.mid;
    case "point":
      return dv.last ? dv.last.v : null;
    case "state":
      return dv.last ? dv.last.v : null;
    case "plan":
      return dv.mid;
  }
}

// ---------------------------------------------------------------------------
// Zeiträume
// ---------------------------------------------------------------------------

export type RangeKey = "T" | "W" | "M" | "6M" | "J";

export interface Col {
  key: string;
  from: string;
  to: string;
  /** Minutenfenster bei der Tagesansicht */
  fromMin?: number;
  toMin?: number;
  label: string | null;
  /** gestrichelte Linie vor der Spalte */
  sep: boolean;
}

export interface Period {
  range: RangeKey;
  from: string;
  to: string;
  cols: Col[];
  title: string;
}

const WD_LETTER = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function monthStart(k: string): string {
  return `${k.slice(0, 7)}-01`;
}

function addMonths(k: string, n: number): string {
  const d = parseDay(monthStart(k));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function monthEnd(k: string): string {
  return addDays(addMonths(k, 1), -1);
}

/** Montag der Woche eines Tages. */
export function weekStart(k: string): string {
  const wd = weekday(k);
  return addDays(k, -((wd + 6) % 7));
}

/** Spalten eines Zeitraums. offset 0 = der Zeitraum, der heute endet; -1 = davor. */
export function periodOf(range: RangeKey, offset: number, today: string): Period {
  const cols: Col[] = [];
  if (range === "T") {
    const day = addDays(today, offset);
    for (let h = 0; h < 24; h++) cols.push({ key: `${day}T${h}`, from: day, to: day, fromMin: h * 60, toMin: h * 60 + 59, label: h % 6 === 0 ? pad(h) : null, sep: h % 6 === 0 });
    return { range, from: day, to: day, cols, title: day === today ? `Heute, ${fmtDate(day)}` : fmtDateWd(day) };
  }
  if (range === "W" || range === "M") {
    const len = range === "W" ? 7 : 30;
    const to = addDays(today, offset * len);
    const from = addDays(to, -(len - 1));
    for (const d of dayRange(from, to)) {
      const wd = weekday(d);
      if (range === "W") cols.push({ key: d, from: d, to: d, label: WD_LETTER[wd], sep: true });
      else cols.push({ key: d, from: d, to: d, label: wd === 1 ? `${parseDay(d).getUTCDate()}.${parseDay(d).getUTCMonth() + 1}.` : null, sep: wd === 1 });
    }
    return { range, from, to, cols, title: fmtSpan(from, to) };
  }
  if (range === "6M") {
    const lastWeek = weekStart(addDays(today, offset * 182));
    for (let i = 25; i >= 0; i--) {
      const from = addDays(lastWeek, -7 * i);
      const to = addDays(from, 6);
      const first = dayRange(from, to).find((d) => d.endsWith("-01"));
      cols.push({ key: from, from, to, label: first ? MONTH_SHORT[parseDay(first).getUTCMonth()] : null, sep: !!first });
    }
    const from = cols[0].from;
    const to = cols[cols.length - 1].to;
    return { range, from, to, cols, title: fmtMonthSpan(from, to) };
  }
  const lastMonth = monthStart(addMonths(today, offset * 12));
  for (let i = 11; i >= 0; i--) {
    const from = addMonths(lastMonth, -i);
    cols.push({ key: from, from, to: monthEnd(from), label: MONTH_INITIAL[parseDay(from).getUTCMonth()], sep: true });
  }
  return { range, from: cols[0].from, to: cols[cols.length - 1].to, cols, title: fmtMonthSpan(cols[0].from, cols[cols.length - 1].to) };
}

export interface ColPoint {
  v: number;
  /** Lage in der Spalte (0–1), bei der Tagesansicht die Minute in der Stunde */
  x: number;
  hollow?: boolean;
  s?: string;
}

export interface ColVal {
  col: Col;
  /** Säulenhöhe bzw. Punktwert */
  v: number | null;
  lo: number | null;
  hi: number | null;
  pts: ColPoint[];
  states: string[];
  /** Einzelwerte bzw. Tage mit Werten */
  n: number;
  days: number;
  due: number;
  given: number;
}

function emptyCol(col: Col): ColVal {
  return { col, v: null, lo: null, hi: null, pts: [], states: [], n: 0, days: 0, due: 0, given: 0 };
}

/** Werte je Spalte. */
export function colValues(def: MetricDef, period: Period, samples: Sample[], days: Map<string, DayVal>): ColVal[] {
  if (period.range === "T") {
    const day = period.from;
    const list = samples.filter((s) => s.day === day);
    return period.cols.map((col) => {
      const cv = emptyCol(col);
      const inCol = list.filter((s) => {
        const m = minutesOf(s.time);
        return m >= (col.fromMin ?? 0) && m <= (col.toMin ?? 1439);
      });
      if (!inCol.length) return cv;
      cv.n = inCol.length;
      cv.days = 1;
      if (def.agg === "sum" || def.agg === "count") cv.v = inCol.reduce((a, s) => a + s.v, 0);
      else {
        cv.pts = inCol.map((s) => ({ v: s.v, x: (minutesOf(s.time) - (col.fromMin ?? 0)) / 60, hollow: s.hollow, s: s.s }));
        const rest = inCol.filter((s) => !s.hollow).map((s) => s.v);
        cv.lo = rest.length ? Math.min(...rest) : null;
        cv.hi = rest.length ? Math.max(...rest) : null;
        cv.v = def.agg === "point" || def.agg === "state" ? inCol[inCol.length - 1].v : rest.length ? (median(rest) as number) : null;
        cv.states = inCol.map((s) => s.s || "").filter(Boolean);
      }
      if (def.agg === "plan") {
        const dv = days.get(day);
        cv.due = dv?.due || 0;
        cv.given = dv?.given || 0;
      }
      return cv;
    });
  }
  return period.cols.map((col) => {
    const cv = emptyCol(col);
    const ds = dayRange(col.from, col.to)
      .map((d) => days.get(d))
      .filter((d): d is DayVal => !!d);
    if (!ds.length) return cv;
    cv.days = ds.length;
    cv.n = ds.reduce((a, d) => a + d.n, 0);
    const single = col.from === col.to;
    switch (def.agg) {
      case "sum":
      case "count": {
        const totals = ds.map((d) => d.total);
        const sum = totals.reduce((a, b) => a + b, 0);
        cv.v = single || def.head === "total" ? sum : sum / ds.length;
        break;
      }
      case "range": {
        const los = ds.map((d) => d.lo).filter((x): x is number => x !== null);
        const his = ds.map((d) => d.hi).filter((x): x is number => x !== null);
        cv.lo = los.length ? Math.min(...los) : null;
        cv.hi = his.length ? Math.max(...his) : null;
        const mids = ds.map((d) => d.mid).filter((x): x is number => x !== null);
        cv.v = mids.length ? (median(mids) as number) : null;
        if (single) {
          const d = ds[0];
          cv.pts = samples.filter((s) => s.day === d.day && s.hollow).map((s) => ({ v: s.v, x: minutesOf(s.time) / 1440, hollow: true }));
        }
        break;
      }
      case "point": {
        const vals = ds.map((d) => d.last?.v).filter((x): x is number => x !== undefined && x !== null);
        cv.v = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        break;
      }
      case "state": {
        cv.states = ds.flatMap((d) => d.states);
        const lv = ds.flatMap((d) => (d.last ? [d.last.v] : []));
        cv.v = lv.length ? Math.max(...lv) : null;
        if (single) cv.pts = samples.filter((s) => s.day === ds[0].day).map((s) => ({ v: s.v, x: minutesOf(s.time) / 1440, s: s.s }));
        break;
      }
      case "plan": {
        cv.due = ds.reduce((a, d) => a + (d.due || 0), 0);
        cv.given = ds.reduce((a, d) => a + (d.given || 0), 0);
        cv.v = cv.due ? (cv.given / cv.due) * 100 : null;
        break;
      }
    }
    return cv;
  });
}

// ---------------------------------------------------------------------------
// Kopfzahl
// ---------------------------------------------------------------------------

export interface Summary {
  label: string;
  value: string;
  unit: string;
  /** Zeile darunter: Zeitraum oder gewählte Spalte */
  when: string;
  /** Zusatz, z. B. „52 von 54 Punkten“ */
  sub?: string;
  empty?: boolean;
}

function stateLabel(def: MetricDef, v: number | null, s?: string): string {
  if (s) return def.states?.find((x) => x.v === s)?.label || s;
  if (v === null) return "–";
  return def.states?.find((x) => x.level === Math.round(v))?.label || "–";
}

function colWhen(period: Period, cv: ColVal): string {
  const c = cv.col;
  if (period.range === "T") return `${pad(Math.floor((c.fromMin ?? 0) / 60))}:00–${pad(Math.floor((c.fromMin ?? 0) / 60) + 1 === 24 ? 0 : Math.floor((c.fromMin ?? 0) / 60) + 1)}:00 Uhr`;
  if (period.range === "W" || period.range === "M") return fmtDateWd(c.from);
  if (period.range === "6M") return fmtSpan(c.from, c.to);
  return `${MONTH_SHORT[parseDay(c.from).getUTCMonth()]} ${parseDay(c.from).getUTCFullYear()}`;
}

/** Kopfzahl für den ganzen Zeitraum oder eine gewählte Spalte. */
export function summaryOf(def: MetricDef, period: Period, cols: ColVal[], samples: Sample[], days: Map<string, DayVal>, today: string, selected: number | null = null): Summary {
  const dec = def.dec ?? 0;
  const sel = selected !== null ? cols[selected] : null;
  const when = sel ? colWhen(period, sel) : period.title;
  const none: Summary = { label: "", value: "Keine Daten", unit: "", when, empty: true };

  if (sel) {
    if (!sel.n && !sel.due) return none;
    switch (def.agg) {
      case "sum":
      case "count": {
        const avgCol = period.range === "6M" || period.range === "J";
        const label = avgCol && def.head !== "total" ? "TÄGLICHER DURCHSCHNITT" : "GESAMT";
        return { label, value: avgCol && def.head !== "total" && def.agg === "count" ? fmtMax(sel.v ?? 0, 1) : fmt(sel.v, dec), unit: def.unit, when };
      }
      case "range":
        if (sel.lo === null || sel.hi === null) return { ...none, value: "Nur nach Bewegung", empty: true };
        return { label: sel.lo === sel.hi ? "MESSWERT" : "BEREICH", value: sel.lo === sel.hi ? fmt(sel.lo, dec) : `${fmt(sel.lo, dec)}–${fmt(sel.hi, dec)}`, unit: def.unit, when };
      case "point":
        return { label: period.range === "6M" || period.range === "J" ? "DURCHSCHNITT" : def.label.toUpperCase(), value: fmt(sel.v, dec), unit: def.unit, when };
      case "state":
        return { label: sel.states.length > 1 ? "EINTRÄGE" : "EINSCHÄTZUNG", value: sel.states.length > 1 ? sel.states.map((s) => stateLabel(def, null, s)).join(", ") : stateLabel(def, sel.v, sel.states[0]), unit: "", when };
      case "plan":
        return { label: "EINGEHALTEN", value: fmt(sel.v, 0), unit: "%", when, sub: `${fmt(sel.given)} von ${fmt(sel.due)} fälligen Punkten` };
    }
  }

  const inPeriod = (d: string) => d >= period.from && d <= period.to;
  const dayList = [...days.values()].filter((d) => inPeriod(d.day)).sort((a, b) => a.day.localeCompare(b.day));
  if (!dayList.length) return none;

  switch (def.agg) {
    case "sum":
    case "count": {
      if (period.range === "T") return { label: "GESAMT", value: fmt(dayList[0].total, dec), unit: def.unit, when };
      if (def.head === "total") return { label: "GESAMT", value: fmt(dayList.reduce((a, d) => a + d.total, 0), dec), unit: def.unit, when };
      // Durchschnitt nur über abgeschlossene Tage; der laufende Tag zählt erst, wenn es sonst nichts gibt.
      const done = dayList.filter((d) => d.day < today);
      const use = done.length ? done : dayList;
      const avg = use.reduce((a, d) => a + d.total, 0) / use.length;
      const label = period.range === "6M" || period.range === "J" ? "TÄGLICHER DURCHSCHNITT" : "DURCHSCHNITT";
      return { label, value: def.agg === "count" ? fmtMax(avg, 1) : fmt(avg, dec), unit: def.unit, when, sub: done.length ? undefined : "nur heute, bis jetzt" };
    }
    case "range": {
      const rest = samples.filter((s) => inPeriod(s.day) && !s.hollow).map((s) => s.v);
      if (!rest.length) return { ...none, value: "Nur nach Bewegung" };
      const lo = Math.min(...rest);
      const hi = Math.max(...rest);
      return { label: lo === hi ? "MESSWERT" : "BEREICH", value: lo === hi ? fmt(lo, dec) : `${fmt(lo, dec)}–${fmt(hi, dec)}`, unit: def.unit, when, sub: rest.length > 2 ? `Median ${fmt(median(rest), dec)} · ${fmt(rest.length)} Messungen` : undefined };
    }
    case "point": {
      if (period.range === "T") {
        const last = dayList[dayList.length - 1].last;
        return { label: def.label.toUpperCase(), value: fmt(last?.v ?? null, dec), unit: def.unit, when };
      }
      const vals = dayList.map((d) => d.last?.v).filter((x): x is number => x !== undefined && x !== null);
      return { label: "DURCHSCHNITT", value: fmt(vals.reduce((a, b) => a + b, 0) / vals.length, dec), unit: def.unit, when };
    }
    case "state": {
      const last = [...samples].reverse().find((s) => inPeriod(s.day));
      return { label: "ZULETZT", value: stateLabel(def, last?.v ?? null, last?.s), unit: "", when };
    }
    case "plan": {
      const due = dayList.reduce((a, d) => a + (d.due || 0), 0);
      const given = dayList.reduce((a, d) => a + (d.given || 0), 0);
      if (!due) return none;
      return { label: "EINGEHALTEN", value: fmt((given / due) * 100, 0), unit: "%", when, sub: `${fmt(given)} von ${fmt(due)} fälligen Punkten` };
    }
  }
}

// ---------------------------------------------------------------------------
// Achsen
// ---------------------------------------------------------------------------

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

function niceStep(span: number, maxTicks = 3): number {
  const raw = span / maxTicks;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p + 1e-9) return m * p;
  return 10 * p;
}

/** Achse von 0 bis zu einem runden Wert über dem Maximum (Säulen). */
export function zeroScale(maxV: number, maxTicks = 3): Scale {
  const top = maxV > 0 ? maxV : 1;
  const step = niceStep(top, maxTicks);
  const max = Math.ceil(top / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min: 0, max, ticks };
}

/** Achse um die Werte herum (Bereiche, Gewicht). */
export function spanScale(values: number[], minSpan: number, floor?: number, ceil?: number): Scale {
  if (!values.length) return { min: floor ?? 0, max: (floor ?? 0) + minSpan, ticks: [floor ?? 0, (floor ?? 0) + minSpan] };
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const step = niceStep(hi - lo, 3);
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  if (floor !== undefined) min = Math.max(floor, min);
  if (ceil !== undefined) max = Math.min(ceil, max);
  if (max <= min) max = min + step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min, max, ticks };
}

export function scaleFor(def: MetricDef, cols: ColVal[]): Scale {
  if (def.agg === "plan") return { min: 0, max: 100, ticks: [0, 50, 100] };
  if (def.agg === "state") return { min: 0, max: 2, ticks: [0, 1, 2] };
  if (def.agg === "sum" || def.agg === "count") return zeroScale(Math.max(0, ...cols.map((c) => c.v ?? 0)));
  const vals: number[] = [];
  for (const c of cols) {
    for (const x of [c.lo, c.hi, def.agg === "point" ? c.v : null]) if (x !== null) vals.push(x);
    for (const p of c.pts) vals.push(p.v);
  }
  // ohne Werte: Fläche um die Orientierungslinie, damit sie sichtbar bleibt
  if (def.ref && !vals.length) vals.push(def.ref.value - 1, def.ref.value + 1);
  else if (def.ref && vals.length) {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    // Orientierungslinie mit etwas Luft einbeziehen, damit sie nicht auf dem Rand der Fläche liegt
    if (def.ref.value >= lo - (hi - lo) * 0.6 && def.ref.value <= hi + (hi - lo + 10) * 0.6) vals.push(def.ref.value - 1, def.ref.value + 1);
  }
  if (def.id === "spo2") return spanScale(vals, 6, 70, 100);
  if (def.id === "gewicht") return spanScale(vals, 2);
  return spanScale(vals, 10, 0);
}

// ---------------------------------------------------------------------------
// Tagesplan
// ---------------------------------------------------------------------------

/** Fällige und gegebene Planpunkte je Tag (nur Häkchen-Punkte; laufender Tag bis jetzt). */
export function planDays(regs: Regimen[], checks: Check[], from: string, now: BerlinNow): Map<string, PlanDay> {
  const out = new Map<string, PlanDay>();
  const byKey = new Map<string, Check>();
  for (const c of checks) byKey.set(`${c.day}|${c.slot}`, c);
  for (const day of dayRange(from, now.day)) {
    const items = itemsForDay(regs, day).filter((it) => it.kind === "check" && (day < now.day || minutesOf(it.time) <= now.minutes));
    if (!items.length) continue;
    let given = 0;
    for (const it of items) {
      const c = byKey.get(`${day}|${it.slot}`);
      if (c && itemGiven({ done: true, skipped: !!c.skipped, at: c.time, by: null, ref: c })) given++;
    }
    out.set(day, { due: items.length, given });
  }
  return out;
}

/** Summe eines Tages bis zu einer Uhrzeit (für „heute bisher“). */
export function sumUntil(samples: Sample[], day: string, minutes: number): number {
  let s = 0;
  for (const x of samples) if (x.day === day && !x.paper && minutesOf(x.time) <= minutes) s += x.v;
  return s;
}

