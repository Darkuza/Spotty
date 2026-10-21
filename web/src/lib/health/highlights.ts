// Highlights und Trends: kurze Sätze mit Diagramm, aus den Messreihen abgeleitet.
// Highlights vergleichen „heute bisher“ mit sonst oder fassen die letzten 7 Tage zusammen;
// Trends vergleichen die letzten 7 abgeschlossenen Tage mit den 7 Tagen davor.

import { addDays, dayRange, weekday, type BerlinNow } from "@shared/dates.ts";
import { metricOf, type MetricDef } from "./metrics";
import { dayValueOf, dayValues, samplesOf, sumUntil, type DayVal, type Sample, type Sources } from "./series";
import { fmt, fmtDayMonthShort, fmtMax } from "./format";

export type HlChart =
  | { kind: "cum"; today: number[]; usual: number[]; nowIdx: number; step: number }
  | { kind: "bars"; labels: string[]; values: (number | null)[]; avg: number | null }
  | { kind: "range"; labels: string[]; lo: (number | null)[]; hi: (number | null)[] }
  | { kind: "points"; labels: string[]; values: (number | null)[] };

export interface HlStat {
  label: string;
  value: string;
  unit: string;
  /** grau statt Kategoriefarbe */
  gray?: boolean;
}

export interface Highlight {
  id: string;
  metric: string;
  text: string;
  stats: HlStat[];
  chart: HlChart;
}

const LETTER = ["S", "M", "D", "M", "D", "F", "S"];

interface Ctx {
  src: Sources;
  now: BerlinNow;
}

function series(id: string, ctx: Ctx): { def: MetricDef; samples: Sample[]; days: Map<string, DayVal> } | null {
  const def = metricOf(id);
  if (!def) return null;
  const samples = samplesOf(def, ctx.src);
  return { def, samples, days: dayValues(def, samples, ctx.src.plan) };
}

/** Kumulierte Tageskurve in Schritten (Minuten) über 24 Stunden. */
function cumulative(samples: Sample[], day: string, step: number): number[] {
  const out: number[] = [];
  for (let m = 0; m <= 1440; m += step) out.push(sumUntil(samples, day, Math.min(m, 1439)));
  return out;
}

/** „Heute bisher“ gegen den Durchschnitt der vorigen Tage zur selben Uhrzeit (Trinken, Futter). */
function todayVsUsual(id: "trinken" | "futter", ctx: Ctx): Highlight | null {
  const s = series(id, ctx);
  if (!s) return null;
  const { def, samples } = s;
  const today = ctx.now.day;
  if (ctx.now.minutes < 9 * 60) return null;
  // Ohne einen Eintrag von heute gibt es nichts zu vergleichen („0 g“ hieße nur: noch nicht eingetragen).
  if (!samples.some((x) => x.day === today && !x.paper)) return null;
  // Vergleichstage: die letzten bis zu 7 abgeschlossenen Tage mit Einzeleinträgen (keine reinen Papiersummen)
  const prev: string[] = [];
  for (let i = 1; i <= 14 && prev.length < 7; i++) {
    const d = addDays(today, -i);
    if (samples.some((x) => x.day === d && !x.paper)) prev.push(d);
  }
  if (prev.length < 3) return null;
  const step = 30;
  const curves = prev.map((d) => cumulative(samples, d, step));
  const usual = curves[0].map((_, i) => curves.reduce((a, c) => a + c[i], 0) / curves.length);
  const todayCurve = cumulative(samples, today, step);
  const nowIdx = Math.floor(ctx.now.minutes / step);
  const t = sumUntil(samples, today, ctx.now.minutes);
  const u = prev.reduce((a, d) => a + sumUntil(samples, d, ctx.now.minutes), 0) / prev.length;
  if (u <= 0 && t <= 0) return null;
  const verb = id === "trinken" ? "getrunken" : "gefressen";
  const ratio = u > 0 ? t / u : 2;
  const text = ratio < 0.85 ? `Spotty hat heute bisher weniger ${verb} als sonst um diese Zeit.` : ratio > 1.15 ? `Spotty hat heute bisher mehr ${verb} als sonst um diese Zeit.` : `Spotty hat heute bisher etwa so viel ${verb} wie sonst um diese Zeit.`;
  return {
    id: `${id}-heute`,
    metric: id,
    text,
    stats: [
      { label: "Heute", value: fmt(t), unit: def.unit },
      { label: "Durchschnitt", value: fmt(u), unit: def.unit, gray: true },
    ],
    chart: { kind: "cum", today: todayCurve.slice(0, nowIdx + 1), usual, nowIdx, step },
  };
}

function lastDays(today: string, n: number): string[] {
  return dayRange(addDays(today, -(n - 1)), today);
}

function weekBars(id: string, ctx: Ctx, minDays: number): { def: MetricDef; days: string[]; values: (number | null)[]; avg: number; withData: number } | null {
  const s = series(id, ctx);
  if (!s) return null;
  const days = lastDays(ctx.now.day, 7);
  const values = days.map((d) => dayValueOf(s.def, s.days.get(d)));
  // Durchschnitt über abgeschlossene Tage mit Werten; heute zählt mit, wenn es sonst zu wenige gibt.
  const done = days.filter((d, i) => d < ctx.now.day && values[i] !== null).map((d) => values[days.indexOf(d)] as number);
  const all = values.filter((v): v is number => v !== null);
  const use = done.length >= minDays ? done : all;
  if (use.length < minDays) return null;
  return { def: s.def, days, values, avg: use.reduce((a, b) => a + b, 0) / use.length, withData: use.length };
}

function atemWeek(ctx: Ctx): Highlight | null {
  const w = weekBars("atem", ctx, 3);
  if (!w) return null;
  return {
    id: "atem-woche",
    metric: "atem",
    text: `In den letzten 7 Tagen lagen die Atemzüge in Ruhe im Mittel bei ${fmt(w.avg)} pro Minute.`,
    stats: [{ label: "Tageswert im Mittel", value: fmt(w.avg), unit: w.def.unit }],
    chart: { kind: "bars", labels: w.days.map((d) => LETTER[weekday(d)]), values: w.values, avg: w.avg },
  };
}

function gassiWeek(ctx: Ctx): Highlight | null {
  const w = weekBars("gassi", ctx, 3);
  if (!w) return null;
  return {
    id: "gassi-woche",
    metric: "gassi",
    text: w.withData < 7 ? `An den ${w.withData} Tagen mit Eintrag der letzten Woche war Spotty im Durchschnitt ${fmt(w.avg)} Minuten pro Tag draußen.` : `In den letzten 7 Tagen war Spotty im Durchschnitt ${fmt(w.avg)} Minuten pro Tag draußen.`,
    stats: [{ label: "Durchschnittliche Dauer", value: fmt(w.avg), unit: "min" }],
    chart: { kind: "bars", labels: w.days.map((d) => LETTER[weekday(d)]), values: w.values, avg: w.avg },
  };
}

function planWeek(ctx: Ctx): Highlight | null {
  const s = series("plan", ctx);
  if (!s) return null;
  const days = lastDays(ctx.now.day, 7);
  let due = 0;
  let given = 0;
  for (const d of days) {
    const dv = s.days.get(d);
    due += dv?.due || 0;
    given += dv?.given || 0;
  }
  if (due < 5) return null;
  const values = days.map((d) => dayValueOf(s.def, s.days.get(d)));
  return {
    id: "plan-woche",
    metric: "plan",
    text: `In den letzten 7 Tagen wurden ${fmt(given)} von ${fmt(due)} fälligen Planpunkten gegeben oder erledigt.`,
    stats: [{ label: "Eingehalten", value: fmt((given / due) * 100), unit: "%" }],
    chart: { kind: "bars", labels: days.map((d) => LETTER[weekday(d)]), values, avg: (given / due) * 100 },
  };
}

function spoWeek(ctx: Ctx): Highlight | null {
  const s = series("spo2", ctx);
  if (!s) return null;
  const days = lastDays(ctx.now.day, 7);
  const vals = s.samples.filter((x) => days.includes(x.day)).map((x) => x.v);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return {
    id: "spo2-woche",
    metric: "spo2",
    text: lo === hi ? `Die Sättigung lag in den letzten 7 Tagen bei ${fmt(lo)} %.` : `Die Sättigung lag in den letzten 7 Tagen zwischen ${fmt(lo)} und ${fmt(hi)} %.`,
    stats: [{ label: "Bereich", value: lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`, unit: "%" }],
    chart: { kind: "range", labels: days.map((d) => LETTER[weekday(d)]), lo: days.map((d) => s.days.get(d)?.lo ?? null), hi: days.map((d) => s.days.get(d)?.hi ?? null) },
  };
}

function weightMonth(ctx: Ctx): Highlight | null {
  const s = series("gewicht", ctx);
  if (!s) return null;
  const from = addDays(ctx.now.day, -29);
  const pts = s.samples.filter((x) => x.day >= from);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const diff = Math.round((last.v - first.v) * 10) / 10;
  const text = Math.abs(diff) < 0.1 ? `Das Gewicht ist seit dem ${fmtDayMonthShort(first.day)} gleich geblieben: ${fmt(last.v, 1)} kg.` : `Das Gewicht ist seit dem ${fmtDayMonthShort(first.day)} von ${fmt(first.v, 1)} auf ${fmt(last.v, 1)} kg ${diff > 0 ? "gestiegen" : "gesunken"}.`;
  const days = dayRange(from, ctx.now.day);
  return {
    id: "gewicht-monat",
    metric: "gewicht",
    text,
    stats: [
      { label: "Zuletzt", value: fmt(last.v, 1), unit: "kg" },
      { label: fmtDayMonthShort(first.day), value: fmt(first.v, 1), unit: "kg", gray: true },
    ],
    chart: { kind: "points", labels: days.map((d, i) => (i === 0 || i === days.length - 1 ? fmtDayMonthShort(d) : "")), values: days.map((d) => s.days.get(d)?.last?.v ?? null) },
  };
}

/** Alle Highlights, wichtigste zuerst. Mit `metric` nur die eines Messwerts. */
export function highlightsOf(src: Sources, now: BerlinNow, metric?: string): Highlight[] {
  const ctx: Ctx = { src, now };
  const all = [todayVsUsual("trinken", ctx), todayVsUsual("futter", ctx), atemWeek(ctx), planWeek(ctx), spoWeek(ctx), gassiWeek(ctx), weightMonth(ctx)].filter((h): h is Highlight => !!h);
  return metric ? all.filter((h) => h.metric === metric) : all;
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export interface Trend {
  metric: string;
  dir: "up" | "down";
  recent: number;
  before: number;
  text: string;
}

const TREND_MIN: Record<string, number> = { atem: 2, trinken: 50, futter: 20, gassi: 5, gewicht: 0.3, spo2: 1, kot: 0.5, puls: 5 };
export const TREND_METRICS = Object.keys(TREND_MIN);

/** Mittel der Tageswerte von `from` bis `to`, wenn mindestens `need` Tage Werte haben. */
function windowMean(def: MetricDef, days: Map<string, DayVal>, from: string, to: string, need: number): number | null {
  const vals = dayRange(from, to)
    .map((d) => {
      const dv = days.get(d);
      if (!dv) return null;
      if (def.id === "spo2") return dv.lo;
      return dayValueOf(def, dv);
    })
    .filter((v): v is number => v !== null);
  if (vals.length < need) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Trend eines Messwerts oder null, wenn die Daten nicht reichen oder sich nichts deutlich ändert. */
export function trendOf(id: string, src: Sources, today: string): Trend | null | "zu wenig" {
  const def = metricOf(id);
  if (!def) return null;
  const samples = samplesOf(def, src);
  const days = dayValues(def, samples, src.plan);
  const recent = windowMean(def, days, addDays(today, -7), addDays(today, -1), 4);
  const before = windowMean(def, days, addDays(today, -14), addDays(today, -8), 4);
  if (recent === null || before === null) return "zu wenig";
  const diff = recent - before;
  const min = TREND_MIN[id] ?? 0;
  if (Math.abs(diff) < min || (before !== 0 && Math.abs(diff / before) < 0.1)) return null;
  const dec = def.dec ?? 0;
  const f = (v: number) => (def.agg === "count" ? fmtMax(v, 1) : fmt(v, dec));
  const what = def.id === "spo2" ? "niedrigster Tageswert" : def.agg === "sum" || def.agg === "count" ? "pro Tag" : "Tageswert";
  return {
    metric: id,
    dir: diff > 0 ? "up" : "down",
    recent,
    before,
    text: `Ø ${f(recent)} ${def.unit} ${what} in den letzten 7 Tagen, in den 7 Tagen davor ${f(before)}.`,
  };
}

export function trendsOf(src: Sources, today: string): { items: Trend[]; enough: boolean } {
  const items: Trend[] = [];
  let enough = false;
  for (const id of TREND_METRICS) {
    const t = trendOf(id, src, today);
    if (t === "zu wenig") continue;
    enough = true;
    if (t) items.push(t);
  }
  return { items, enough };
}
