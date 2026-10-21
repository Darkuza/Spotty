// Datumslogik für App und Edge Functions.
// Tage werden als "YYYY-MM-DD" geführt und immer in der Zeitzone Europe/Berlin bestimmt,
// damit Handy, Server und Erinnerungen denselben Kalendertag meinen.

export const TZ = "Europe/Berlin";

export const WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

export function pad(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

const berlinFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface BerlinNow {
  day: string;
  minutes: number;
  hm: string;
  seconds: number;
}

/** Aktueller Kalendertag und Uhrzeit in Berlin. */
export function berlinNow(d: Date = new Date()): BerlinNow {
  const parts: Record<string, string> = {};
  for (const p of berlinFormat.formatToParts(d)) parts[p.type] = p.value;
  let h = parseInt(parts.hour, 10);
  if (h === 24) h = 0;
  const m = parseInt(parts.minute, 10);
  const s = parseInt(parts.second, 10);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: h * 60 + m, hm: `${pad(h)}:${pad(m)}`, seconds: s };
}

export function todayKey(): string {
  return berlinNow().day;
}

export function parseDay(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(k: string, n: number): string {
  const d = parseDay(k);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

export function weekday(k: string): number {
  return parseDay(k).getUTCDay();
}

export function minutesOf(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function hmOf(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function isValidHm(t: unknown): t is string {
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function isValidDay(k: unknown): k is string {
  return typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(parseDay(k).getTime());
}

/** "Fr, 01.03." */
export function fmtDayShort(k: string): string {
  const d = parseDay(k);
  return `${WD_SHORT[d.getUTCDay()]}, ${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.`;
}

/** "01.03." */
export function fmtDM(k: string): string {
  const d = parseDay(k);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.`;
}

/** "01.03.2030" */
export function fmtDMY(k: string): string {
  const d = parseDay(k);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** "Freitag, 1. März 2030" */
export function fmtDayLong(k: string): string {
  const d = parseDay(k);
  return `${WD_LONG[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Freitag, 1. März" */
export function fmtDayMid(k: string): string {
  const d = parseDay(k);
  return `${WD_LONG[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

/** "1. März" */
export function fmtDayMonth(k: string): string {
  const d = parseDay(k);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

/** "März 2030" */
export function fmtMonth(k: string): string {
  const d = parseDay(k);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Alter in Jahren (und Monaten) an einem Stichtag. */
export function ageAt(born: string, day: string): { years: number; months: number } {
  const b = parseDay(born);
  const d = parseDay(day);
  let years = d.getUTCFullYear() - b.getUTCFullYear();
  let months = d.getUTCMonth() - b.getUTCMonth();
  if (d.getUTCDate() < b.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months };
}

/** Lokaler Berliner Tag + Uhrzeit eines ISO-Zeitstempels. */
export function berlinOfIso(iso: string): BerlinNow {
  return berlinNow(new Date(iso));
}

/** Liste aller Tage von a bis b (einschließlich). */
export function dayRange(a: string, b: string): string[] {
  const out: string[] = [];
  if (b < a) return out;
  let k = a;
  for (let i = 0; i < 4000 && k <= b; i++) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}
