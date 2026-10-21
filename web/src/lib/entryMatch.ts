// Erkennt, ob zwei Protokolleinträge dasselbe Ereignis beschreiben (gleicher Tag, gleiche Uhrzeit,
// gleiche Art und gleicher Hauptwert) – etwa ein von Hand eingetragener Wert und derselbe Wert aus einer Akte-Datei.

import type { Entry, EntryType } from "@shared/types.ts";

/** Hauptwert je Art; Arten ohne Zahlenwert gelten bei gleicher Minute als dasselbe Ereignis. */
const MAIN_FIELD: Partial<Record<EntryType, string>> = { atem: "bpm", spo2: "pct", gewicht: "kg", trinken: "ml", futter: "g", gassi: "min" };

export function sameEntry(a: Pick<Entry, "day" | "time" | "type" | "data">, b: Pick<Entry, "day" | "time" | "type" | "data">): boolean {
  if (a.day !== b.day || a.time !== b.time || a.type !== b.type) return false;
  const k = MAIN_FIELD[a.type];
  if (!k) return true;
  const va = Number((a.data as Record<string, unknown>)?.[k]);
  const vb = Number((b.data as Record<string, unknown>)?.[k]);
  if (Number.isFinite(va) || Number.isFinite(vb)) return va === vb;
  return true;
}
