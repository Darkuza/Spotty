// Tagesbilanzen und Kennzahlen aus den Protokolleinträgen.

import type { DayNote, Entry } from "./types.ts";
import { num } from "./entryTypes.ts";
import { minutesOf } from "./dates.ts";

export interface AtemPoint {
  time: string;
  bpm: number;
  zustand: string;
  o2: boolean;
}

export interface DayStats {
  day: string;
  count: number;
  trinkenMl: number;
  spritzeMl: number;
  selbstMl: number;
  trinkenN: number;
  futterG: number;
  futterN: number;
  futterOhneMenge: string[];
  abgelehnt: number;
  schmerz: number;
  kot: number;
  kotAuff: number;
  kotSchwarz: number;
  urin: number;
  lastUrin: string | null;
  erbrechen: number;
  husten: number;
  gassiMin: number;
  gassiN: number;
  atem: AtemPoint[];
  atemWert: number | null;
  atemMin: number | null;
  atemMax: number | null;
  spo2: { time: string; pct: number }[];
  spo2Min: number | null;
  kg: number | null;
  meds: Entry[];
  lastTrinken: string | null;
  lastFutter: string | null;
  paperMl: number | null;
  paperG: number | null;
  nacht: string | null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sortEntries<T extends Pick<Entry, "time" | "created_at">>(list: T[]): T[] {
  return [...list].sort((a, b) => minutesOf(a.time) - minutesOf(b.time) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

export function dayStats(all: Entry[], day: string, note?: DayNote | null): DayStats {
  const es = sortEntries(all.filter((e) => e.day === day));
  const st: DayStats = {
    day,
    count: es.length,
    trinkenMl: 0,
    spritzeMl: 0,
    selbstMl: 0,
    trinkenN: 0,
    futterG: 0,
    futterN: 0,
    futterOhneMenge: [],
    abgelehnt: 0,
    schmerz: 0,
    kot: 0,
    kotAuff: 0,
    kotSchwarz: 0,
    urin: 0,
    lastUrin: null,
    erbrechen: 0,
    husten: 0,
    gassiMin: 0,
    gassiN: 0,
    atem: [],
    atemWert: null,
    atemMin: null,
    atemMax: null,
    spo2: [],
    spo2Min: null,
    kg: null,
    meds: [],
    lastTrinken: null,
    lastFutter: null,
    paperMl: note?.paper_ml ?? null,
    paperG: note?.paper_g ?? null,
    nacht: note?.nacht ?? null,
  };
  for (const e of es) {
    const d = (e.data || {}) as Record<string, unknown>;
    switch (e.type) {
      case "trinken": {
        const ml = num(d.ml) ?? 0;
        st.trinkenMl += ml;
        st.trinkenN++;
        if (d.weg === "selbst") st.selbstMl += ml;
        else st.spritzeMl += ml;
        st.lastTrinken = e.time;
        break;
      }
      case "futter": {
        if (d.reaktion === "abgelehnt") {
          st.abgelehnt++;
          break;
        }
        const g = num(d.g);
        if (g != null) st.futterG += g;
        else if (d.menge) st.futterOhneMenge.push(`${d.menge} ${d.art || ""}`.trim());
        st.futterN++;
        if (d.reaktion === "Schmerzreaktion") st.schmerz++;
        st.lastFutter = e.time;
        break;
      }
      case "kot":
        st.kot++;
        if (d.farbe === "schwarz, klebrig") st.kotSchwarz++;
        if (d.farbe === "schwarz, klebrig" || (Array.isArray(d.auff) && d.auff.length)) st.kotAuff++;
        break;
      case "urin":
        st.urin++;
        st.lastUrin = e.time;
        break;
      case "erbrechen":
        st.erbrechen++;
        break;
      case "husten":
        st.husten += num(d.anzahl) ?? 1;
        break;
      case "gassi":
        st.gassiN++;
        st.gassiMin += num(d.min) ?? 0;
        break;
      case "atem": {
        const b = num(d.bpm);
        if (b != null) st.atem.push({ time: e.time, bpm: b, zustand: String(d.zustand || ""), o2: d.o2 === "ja" });
        break;
      }
      case "spo2": {
        const p = num(d.pct);
        if (p != null && d.pulsOk !== "nein") st.spo2.push({ time: e.time, pct: p });
        break;
      }
      case "gewicht": {
        const kg = num(d.kg);
        if (kg != null) st.kg = kg;
        break;
      }
      case "med":
        st.meds.push(e);
        break;
    }
  }
  const rest = st.atem.filter((a) => a.zustand !== "aktiv").map((a) => a.bpm);
  st.atemWert = median(rest);
  st.atemMin = rest.length ? Math.min(...rest) : null;
  st.atemMax = rest.length ? Math.max(...rest) : null;
  st.spo2Min = st.spo2.length ? Math.min(...st.spo2.map((x) => x.pct)) : null;
  return st;
}

/** Flüssigkeit des Tages: einzeln eingetragene Mengen, sonst die Summe vom Papierprotokoll. */
export function fluidOfDay(st: DayStats): { ml: number | null; source: "einträge" | "papier" | null } {
  if (st.trinkenN > 0) return { ml: st.trinkenMl, source: "einträge" };
  if (st.paperMl != null) return { ml: st.paperMl, source: "papier" };
  return { ml: null, source: null };
}

export function foodOfDay(st: DayStats): { g: number | null; source: "einträge" | "papier" | null } {
  if (st.futterN > 0 && st.futterG > 0) return { g: st.futterG, source: "einträge" };
  if (st.paperG != null) return { g: st.paperG, source: "papier" };
  return { g: null, source: null };
}
