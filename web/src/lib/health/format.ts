// Zahlen und Zeiträume so schreiben, wie iOS sie auf Deutsch anzeigt: 2.012 Schritte, 15.–21. Okt. 2026.

import { addDays, parseDay } from "@shared/dates.ts";

const cache = new Map<number, Intl.NumberFormat>();

/** Zahl mit Tausenderpunkt und Komma, z. B. 1.250 oder 23,4. */
export function fmt(n: number | null | undefined, dec = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return "–";
  let f = cache.get(dec);
  if (!f) {
    f = new Intl.NumberFormat("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    cache.set(dec, f);
  }
  // „-0“ vermeiden
  const v = Math.abs(n) < Math.pow(10, -dec) / 2 ? 0 : n;
  return f.format(v);
}

/** Höchstens `dec` Nachkommastellen, ohne überflüssige Nullen (23 statt 23,0). */
export function fmtMax(n: number | null | undefined, dec = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "–";
  const r = Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);
  return fmt(r, Number.isInteger(r) ? 0 : dec);
}

export const MONTH_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
export const MONTH_INITIAL = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const WD_SHORT = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

function parts(k: string) {
  const d = parseDay(k);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() };
}

/** „21. Okt. 2026“ */
export function fmtDate(k: string): string {
  const p = parts(k);
  return `${p.d}. ${MONTH_SHORT[p.m]} ${p.y}`;
}

/** „Mi., 21. Okt. 2026“ */
export function fmtDateWd(k: string): string {
  const p = parts(k);
  return `${WD_SHORT[p.wd]}, ${p.d}. ${MONTH_SHORT[p.m]} ${p.y}`;
}

/** „21. Okt.“ */
export function fmtDayMonthShort(k: string): string {
  const p = parts(k);
  return `${p.d}. ${MONTH_SHORT[p.m]}`;
}

/** Zeitraum wie in Health: „15.–21. Okt. 2026“, „29. Sept.–5. Okt. 2026“, „29. Dez. 2025–4. Jan. 2026“. */
export function fmtSpan(from: string, to: string): string {
  if (from === to) return fmtDate(from);
  const a = parts(from);
  const b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${a.d}.–${b.d}. ${MONTH_SHORT[b.m]} ${b.y}`;
  if (a.y === b.y) return `${a.d}. ${MONTH_SHORT[a.m]}–${b.d}. ${MONTH_SHORT[b.m]} ${b.y}`;
  return `${a.d}. ${MONTH_SHORT[a.m]} ${a.y}–${b.d}. ${MONTH_SHORT[b.m]} ${b.y}`;
}

/** Monatsspanne: „Mai–Okt. 2026“, „Nov. 2025–Okt. 2026“. */
export function fmtMonthSpan(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${MONTH_SHORT[b.m]} ${b.y}`;
  if (a.y === b.y) return `${MONTH_SHORT[a.m]}–${MONTH_SHORT[b.m]} ${b.y}`;
  return `${MONTH_SHORT[a.m]} ${a.y}–${MONTH_SHORT[b.m]} ${b.y}`;
}

/** Zeitpunkt eines Werts in Karten: heute „20:19“, gestern „Gestern“, sonst „19. Okt.“ oder „Nov. 2024“. */
export function fmtWhen(day: string, time: string | null, today: string): string {
  if (day === today) return time || "Heute";
  if (day === addDays(today, -1)) return "Gestern";
  const a = parts(day);
  const t = parts(today);
  if (a.y === t.y) return `${a.d}. ${MONTH_SHORT[a.m]}`;
  return `${MONTH_SHORT[a.m]} ${a.y}`;
}

/** Plural mit Zahl: „1 Eintrag“, „3 Einträge“. */
export function plural(n: number, one: string, many: string): string {
  return `${fmt(n)} ${n === 1 ? one : many}`;
}
