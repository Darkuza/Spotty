// Plan-Engine: berechnet aus den Behandlungsplänen (regimens) die Punkte eines Tages,
// den Fahrplan der Dosen und die Reichweite eines Vorrats. Reine Funktionen ohne Abhängigkeiten,
// damit App und Erinnerungsfunktion dieselben Ergebnisse liefern.

import type { Check, Entry, Photo, PlanItem, Regimen, Step } from "./types.ts";
import { addDays, daysBetween, minutesOf, weekday } from "./dates.ts";

export function stepActive(step: Step, day: string): boolean {
  if (!step || !step.from || day < step.from) return false;
  if (step.to && day > step.to) return false;
  const pattern = step.pattern || "daily";
  if (pattern === "alternate") {
    const anchor = step.anchor || step.from;
    const n = daysBetween(anchor, day);
    return n >= 0 && n % 2 === 0;
  }
  if (pattern === "weekdays") return (step.weekdays || []).includes(weekday(day));
  return true;
}

export function stepFor(reg: Regimen, day: string): Step | null {
  if (!reg || !reg.active) return null;
  for (const s of reg.steps || []) if (stepActive(s, day)) return s;
  return null;
}

export function kindOf(reg: Regimen): PlanItem["kind"] {
  if (reg.category === "mess") return "mess";
  if (reg.category === "foto") return "foto";
  return "check";
}

export function itemsForDay(regs: Regimen[], day: string): PlanItem[] {
  const out: PlanItem[] = [];
  const sorted = [...regs].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  for (const r of sorted) {
    const st = stepFor(r, day);
    if (!st) continue;
    const kind = kindOf(r);
    for (const sl of r.slots || []) {
      if (!sl || !sl.key || !sl.time) continue;
      const title = kind === "mess" ? (sl.label ? `${r.name} ${sl.label}` : r.name) : r.name + (st.dose ? ` ${st.dose}` : "");
      const detail = [st.label, r.instructions].filter((x) => x && String(x).trim()).join(" · ");
      out.push({
        slot: sl.key,
        regimenId: r.id,
        kind,
        category: r.category,
        time: sl.time,
        title,
        detail,
        dose: st.dose ?? null,
        amount: typeof st.amount === "number" ? st.amount : null,
        measure: r.measure ?? null,
        notify: r.notify !== false,
        slotLabel: sl.label ?? null,
      });
    }
  }
  // Stabile Sortierung: gleiche Uhrzeit behält die Reihenfolge der Pläne.
  return out
    .map((it, i) => ({ it, i }))
    .sort((a, b) => minutesOf(a.it.time) - minutesOf(b.it.time) || a.i - b.i)
    .map((x) => x.it);
}

export interface ItemState {
  done: boolean;
  at: string | null;
  by: string | null;
  ref: Check | Entry | Photo | null;
}

/** Ist ein Planpunkt erledigt? Medikamente über Häkchen, Messungen über Einträge mit passendem Slot, Fotos über mindestens ein Foto des Tages. */
export function itemState(item: PlanItem, day: string, checks: Check[], entries: Entry[], photos: Photo[]): ItemState {
  if (item.kind === "check") {
    const c = checks.find((x) => x.day === day && x.slot === item.slot);
    return c ? { done: true, at: c.time, by: c.created_by ?? null, ref: c } : { done: false, at: null, by: null, ref: null };
  }
  if (item.kind === "mess") {
    const es = entries.filter((e) => e.day === day && e.slot === item.slot);
    const e = es[es.length - 1];
    return e ? { done: true, at: e.time, by: e.created_by ?? null, ref: e } : { done: false, at: null, by: null, ref: null };
  }
  const ps = photos.filter((p) => p.day === day);
  const p = ps[0];
  return p ? { done: true, at: p.time, by: p.created_by ?? null, ref: p } : { done: false, at: null, by: null, ref: null };
}

/** Nächster offener Messslot eines Typs, dessen Uhrzeit nahe an der Eintragszeit liegt. */
export function autoSlot(items: PlanItem[], measure: string, time: string, taken: Set<string>, windowMin = 150): string | null {
  let best: PlanItem | null = null;
  let bestDiff = Infinity;
  const t = minutesOf(time);
  for (const it of items) {
    if (it.kind !== "mess" || it.measure !== measure || taken.has(it.slot)) continue;
    const diff = Math.abs(minutesOf(it.time) - t);
    if (diff <= windowMin && diff < bestDiff) {
      best = it;
      bestDiff = diff;
    }
  }
  return best ? best.slot : null;
}

export interface Phase {
  step: Step;
  index: number;
  current: boolean;
  past: boolean;
}

export function phases(reg: Regimen, today: string): Phase[] {
  return (reg.steps || []).map((step, index) => ({
    step,
    index,
    current: today >= step.from && (!step.to || today <= step.to),
    past: !!step.to && today > step.to,
  }));
}

/** Nächste Dosisänderung ab morgen (anderer Schritt mit anderer Dosis oder Ende). */
export function nextChange(reg: Regimen, today: string): { day: string; step: Step | null } | null {
  const cur = (reg.steps || []).find((s) => today >= s.from && (!s.to || today <= s.to)) || null;
  const later = (reg.steps || []).filter((s) => s.from > today).sort((a, b) => a.from.localeCompare(b.from));
  if (cur && cur.to) {
    const nxt = later.find((s) => s.from > (cur.to as string)) || null;
    if (nxt && nxt.from === addDays(cur.to, 1)) return { day: nxt.from, step: nxt };
    return { day: addDays(cur.to, 1), step: nxt && nxt.from === addDays(cur.to, 1) ? nxt : null };
  }
  if (!cur && later.length) return { day: later[0].from, step: later[0] };
  return null;
}

export function lastDay(reg: Regimen): string | null {
  let last: string | null = null;
  for (const s of reg.steps || []) {
    if (!s.to) return null;
    if (!last || s.to > last) last = s.to;
  }
  return last;
}

export interface DoseEvent {
  day: string;
  time: string;
  amount: number;
}

/** Alle geplanten Gaben eines Plans nach einem Zeitpunkt (Tag + Minuten), bis zum Planende oder höchstens `horizon` Tage. */
export function dosesAfter(reg: Regimen, fromDay: string, fromMinutes: number, horizon = 180): DoseEvent[] {
  const out: DoseEvent[] = [];
  const end = lastDay(reg);
  let day = fromDay;
  for (let i = 0; i < horizon; i++) {
    if (end && day > end) break;
    const st = stepFor(reg, day);
    if (st && typeof st.amount === "number" && st.amount > 0) {
      for (const sl of reg.slots || []) {
        const m = minutesOf(sl.time);
        if (day === fromDay && m <= fromMinutes) continue;
        out.push({ day, time: sl.time, amount: st.amount });
      }
    }
    day = addDays(day, 1);
  }
  out.sort((a, b) => (a.day === b.day ? minutesOf(a.time) - minutesOf(b.time) : a.day.localeCompare(b.day)));
  return out;
}

export interface StockProjection {
  needed: number;
  remainingAtEnd: number;
  runsOut: DoseEvent | null;
  lastCovered: DoseEvent | null;
  end: string | null;
}

export function stockProjection(reg: Regimen, stock: number, fromDay: string, fromMinutes: number): StockProjection {
  const doses = dosesAfter(reg, fromDay, fromMinutes);
  let remaining = stock;
  let needed = 0;
  let runsOut: DoseEvent | null = null;
  let lastCovered: DoseEvent | null = null;
  for (const d of doses) {
    needed += d.amount;
    if (!runsOut) {
      if (remaining + 1e-9 >= d.amount) {
        remaining -= d.amount;
        lastCovered = d;
      } else runsOut = d;
    }
  }
  return { needed: round2(needed), remainingAtEnd: round2(stock - needed), runsOut, lastCovered, end: lastDay(reg) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Anzeige von Mengen wie 0,75 → "¾". */
export function fmtAmount(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "–";
  const whole = Math.floor(n + 1e-9);
  const frac = Math.round((n - whole) * 100) / 100;
  const map: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
  const f = map[String(frac)];
  if (f) return (whole ? String(whole) + " " : "") + f;
  if (frac === 0) return String(whole);
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/** Beginn der laufenden Behandlung: frühester Start der aktiven Medikamente und Inhalationen. */
export function therapyStart(regs: Regimen[]): string | null {
  let start: string | null = null;
  for (const r of regs) {
    if (!r.active || (r.category !== "med" && r.category !== "inh")) continue;
    for (const s of r.steps || []) if (s.from && (!start || s.from < start)) start = s.from;
  }
  return start;
}

/** Das Medikament mit Stufenplan (meiste Zeiträume), z. B. ein Cortison zum Ausschleichen. */
export function leadRegimen(regs: Regimen[]): Regimen | null {
  let best: Regimen | null = null;
  for (const r of regs) {
    if (!r.active || r.category !== "med" || (r.steps || []).length < 2) continue;
    if (!best || r.steps.length > best.steps.length || (r.steps.length === best.steps.length && r.sort < best.sort)) best = r;
  }
  return best;
}
