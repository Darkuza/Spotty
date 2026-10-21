// Eintragstypen des Protokolls: Felder für die Eingabemasken, Kurztexte und Warnhinweise.

import type { Entry, EntryType } from "./types.ts";

export type FieldKind = "num" | "chips" | "multi" | "text" | "area";
export type Opt = string | [string, string];

export interface FieldDef {
  k: string;
  t: FieldKind;
  label: string;
  unit?: string;
  req?: boolean;
  min?: number;
  max?: number;
  dec?: number;
  presets?: [number, string][];
  opts?: Opt[];
  def?: string | number;
  counter?: boolean;
  ph?: string;
  /** letzten Wert auf diesem Gerät als Vorgabe merken */
  remember?: boolean;
}

export interface TypeDef {
  label: string;
  short: string;
  fields: FieldDef[];
  hint?: string;
  measure?: "atem" | "spo2" | "gewicht";
}

const NOTE: FieldDef = { k: "text", t: "text", label: "Notiz", ph: "optional" };

/** Befinden auf einen Blick, z. B. aus der einfachen Ansicht. */
export const BEFINDEN_OPTS: [string, string][] = [
  ["gut", "gut"],
  ["unsicher", "nicht sicher"],
  ["schlecht", "schlecht"],
];

export const LAGE_OPTS: [string, string][] = [
  ["links", "linker Seite"],
  ["rechts", "rechter Seite"],
  ["brust", "Brust / Bauch"],
  ["ruecken", "Rücken"],
  ["sitzt", "sitzt / steht"],
];

export const LAGE_KURZ: Record<string, string> = { links: "links liegend", rechts: "rechts liegend", brust: "auf der Brust", ruecken: "auf dem Rücken", sitzt: "sitzend/stehend" };

export const TYPES: Record<EntryType, TypeDef> = {
  atem: {
    label: "Atemzüge",
    short: "Atemzüge",
    measure: "atem",
    fields: [
      { k: "bpm", t: "num", label: "Atemzüge pro Minute", unit: "/min", req: true, min: 4, max: 200, counter: true },
      { k: "zustand", t: "chips", label: "Dabei", opts: [["schlaeft", "schläft"], ["ruhig", "liegt wach, ruhig"], ["aktiv", "nach Bewegung / unruhig"]], def: "schlaeft" },
      { k: "lage", t: "chips", label: "Liegt auf", opts: LAGE_OPTS },
      { k: "untergrund", t: "chips", label: "Untergrund", opts: ["Holzboden", "Fliesen", "Teppich", "Decke / Kissen", "Hundebett", "Sofa", "Bett"], remember: true },
      { k: "o2", t: "chips", label: "Sauerstoff", opts: [["nein", "ohne"], ["ja", "mit Flow-by"]], def: "nein" },
      NOTE,
    ],
    hint: "Ein Atemzug ist einmal Heben und Senken des Brustkorbs. Nicht beim Hecheln zählen; Cortison kann Hecheln auslösen. Die Liegeseite hilft beim Vergleich, weil eine kranke Lungenseite oben oder unten liegen kann.",
  },
  spo2: {
    label: "Sauerstoffsättigung",
    short: "SpO₂",
    measure: "spo2",
    fields: [
      { k: "pct", t: "num", label: "SpO₂", unit: "%", req: true, min: 50, max: 100 },
      { k: "puls", t: "num", label: "Puls laut Gerät", unit: "/min", min: 20, max: 300 },
      { k: "pulsOk", t: "chips", label: "Gerätepuls passt zum Herzschlag (Hand links am Brustkorb, 15 s × 4)", opts: [["ja", "ja"], ["nein", "nein"], ["offen", "nicht geprüft"]], def: "offen" },
      { k: "stelle", t: "chips", label: "Messstelle", opts: ["Schwanzbasis", "Pfote", "Lippe", "Ohr"] },
      { k: "o2", t: "chips", label: "Sauerstoff", opts: [["nein", "ohne"], ["ja", "mit Flow-by"]], def: "nein" },
      NOTE,
    ],
    hint: "Erst nach 15–20 Minuten Ruhe messen und den Wert nehmen, der 20–30 Sekunden stabil steht. 95 % und mehr ist in Ordnung.",
  },
  gewicht: {
    label: "Gewicht",
    short: "Gewicht",
    measure: "gewicht",
    fields: [{ k: "kg", t: "num", label: "Gewicht", unit: "kg", req: true, min: 3, max: 45, dec: 1 }, NOTE],
    hint: "Morgens vor dem Fressen, immer dieselbe Waage.",
  },
  trinken: {
    label: "Trinken",
    short: "Trinken",
    fields: [
      { k: "ml", t: "num", label: "Menge", unit: "ml", req: true, min: 1, max: 1500, presets: [[10, "10"], [20, "20"], [25, "25"], [30, "30"], [40, "40"], [50, "50"]] },
      { k: "art", t: "chips", label: "Was", opts: ["Wasser", "Hühnerbrühe", "Leberwurstwasser", "Milch-Wasser", "Sonstiges"], def: "Wasser" },
      { k: "weg", t: "chips", label: "Wie", opts: [["spritze", "per Spritze"], ["selbst", "selbst getrunken"]], def: "spritze" },
      NOTE,
    ],
    hint: "Per Spritze höchstens 50 ml auf einmal.",
  },
  futter: {
    label: "Futter",
    short: "Futter",
    fields: [
      { k: "g", t: "num", label: "Menge", unit: "g", min: 0, max: 3000, presets: [[5, "1 TL ≈ 5 g"], [30, "½ Handvoll ≈ 30 g"], [58, "1 Handvoll ≈ 58 g"], [115, "2 Handvoll ≈ 115 g"]] },
      { k: "art", t: "chips", label: "Was", opts: ["Nassfutter", "Huhn", "Frischkäse", "Leberwurst", "Kartoffel", "Trockenfutter", "Sonstiges"], def: "Nassfutter" },
      { k: "reaktion", t: "chips", label: "Danach", opts: ["unauffällig", "Schmerzreaktion", "Übelkeit", "abgelehnt"], def: "unauffällig" },
      NOTE,
    ],
    hint: "Kleine, warme, breiige Portionen. 2 Handvoll Nassfutter waren am 17.10. etwa 115 g.",
  },
  kot: {
    label: "Kot",
    short: "Kot",
    fields: [
      { k: "form", t: "chips", label: "Beschaffenheit", opts: ["fest", "geformt, weich", "breiig", "flüssig"] },
      { k: "farbe", t: "chips", label: "Farbe", opts: ["braun", "hell / orange", "dunkelbraun", "schwarz, klebrig"] },
      { k: "auff", t: "multi", label: "Auffällig", opts: ["Schleim", "frisches Blut"] },
      { k: "menge", t: "chips", label: "Menge", opts: ["klein", "mittel", "groß"] },
      NOTE,
    ],
    hint: "Bei schwarzem, klebrigem Kot: etwas auf Küchenpapier mit Wasser verreiben. Ein rötlicher Rand spricht für Blut.",
  },
  urin: {
    label: "Urin",
    short: "Urin",
    fields: [{ k: "menge", t: "chips", label: "Menge", opts: ["wenig", "normal", "viel"], def: "normal" }, NOTE],
    hint: "Unter Cortison ist mehr Urin zu erwarten. Kein Urin über 12 Stunden: Klinik anrufen.",
  },
  gassi: {
    label: "Gassi",
    short: "Gassi",
    fields: [
      { k: "min", t: "num", label: "Dauer", unit: "min", min: 1, max: 300, presets: [[10, "10"], [15, "15"], [20, "20"], [30, "30"]] },
      { k: "langsam", t: "num", label: "Langsamer geworden nach", unit: "min", min: 0, max: 300 },
      { k: "energie", t: "chips", label: "Energie", opts: ["gut", "mittel", "niedrig"] },
      { k: "atemDanach", t: "chips", label: "Atmung danach", opts: ["wie vorher", "schneller"] },
      NOTE,
    ],
  },
  erbrechen: {
    label: "Erbrechen",
    short: "Erbrechen",
    fields: [
      { k: "inhalt", t: "chips", label: "Was", opts: ["Futter", "Schaum / Schleim", "Flüssigkeit", "gelb (Galle)"] },
      { k: "blut", t: "chips", label: "Blut", opts: [["nein", "kein Blut"], ["ja", "mit Blut"]], def: "nein" },
      NOTE,
    ],
    hint: "Erbrochen innerhalb von 30 Minuten nach einer Tablette: nicht nachgeben, Klinik fragen.",
  },
  husten: {
    label: "Husten",
    short: "Husten",
    fields: [
      { k: "anzahl", t: "num", label: "Hustenanfälle", unit: "×", req: true, min: 1, max: 99, def: 1, presets: [[1, "1"], [2, "2"], [3, "3"], [5, "5"]] },
      { k: "art", t: "chips", label: "Art", opts: ["kurz / Auspusten", "mit Würgen", "feucht, Schleim"] },
      NOTE,
    ],
  },
  med: {
    label: "Medikament außer Plan",
    short: "Medikament",
    fields: [
      { k: "name", t: "text", label: "Mittel", req: true, ph: "Name und Stärke" },
      { k: "dosis", t: "text", label: "Menge", ph: "z. B. ½ Tablette" },
      { k: "grund", t: "text", label: "Grund / abgesprochen mit", ph: "z. B. Rücksprache Klinik" },
    ],
    hint: "Für alles, was nicht im Plan steht. Keine Schmerzmittel wie Meloxicam oder Carprofen zusammen mit Cortison geben.",
  },
  notiz: {
    label: "Beobachtung",
    short: "Beobachtung",
    fields: [
      { k: "befinden", t: "chips", label: "Wie geht es ihm?", opts: BEFINDEN_OPTS },
      { k: "tags", t: "multi", label: "Schnellauswahl", opts: ["hechelt viel", "trinkt viel", "frisst gierig", "unruhig", "Pfotenlecken", "Schmerzzeichen", "starrt / abwesend", "schwach, müde", "munter", "spielt"] },
      { k: "text", t: "area", label: "Beobachtung", ph: "Was ist aufgefallen?" },
    ],
  },
};

export const QUICK_ORDER: EntryType[] = ["atem", "spo2", "trinken", "futter", "kot", "urin", "gassi", "husten", "erbrechen", "gewicht", "med", "notiz"];

export function fieldOf(type: EntryType, k: string): FieldDef | undefined {
  return TYPES[type]?.fields.find((f) => f.k === k);
}

export function optLabel(type: EntryType, k: string, v: unknown): string {
  const f = fieldOf(type, k);
  if (!f || !f.opts) return String(v ?? "");
  for (const o of f.opts) {
    if (Array.isArray(o) ? o[0] === v : o === v) return Array.isArray(o) ? o[1] : o;
  }
  return String(v ?? "");
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

export function fmtNum(n: number | null | undefined, dec = 0): string {
  if (n === null || n === undefined || isNaN(n)) return "–";
  return (dec ? n.toFixed(dec) : String(Math.round(n))).replace(".", ",");
}

function s(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Einzeilige Zusammenfassung eines Eintrags. */
export function summarize(e: Pick<Entry, "type" | "data">): string {
  const d = (e.data || {}) as Record<string, unknown>;
  switch (e.type) {
    case "atem":
      return [
        num(d.bpm) != null ? `${fmtNum(num(d.bpm))}/min` : "–",
        d.zustand ? optLabel("atem", "zustand", d.zustand) : "",
        typeof d.lage === "string" ? LAGE_KURZ[d.lage] || d.lage : "",
        s(d.untergrund),
        d.o2 === "ja" ? "mit O₂" : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "spo2":
      return [
        num(d.pct) != null ? `${fmtNum(num(d.pct))} %` : "–",
        num(d.puls) != null ? `Puls ${fmtNum(num(d.puls))}` : "",
        s(d.stelle),
        d.pulsOk === "nein" ? "Gerätepuls passte nicht" : "",
        d.o2 === "ja" ? "mit O₂" : "",
      ].filter(Boolean).join(" · ");
    case "gewicht":
      return `${fmtNum(num(d.kg), 1)} kg`;
    case "trinken":
      return [`${fmtNum(num(d.ml))} ml ${s(d.art)}`.trim(), d.weg ? optLabel("trinken", "weg", d.weg) : ""].filter(Boolean).join(" · ");
    case "futter": {
      if (d.reaktion === "abgelehnt") return `${s(d.art) || "Futter"} abgelehnt`;
      const amount = num(d.g) != null ? `${fmtNum(num(d.g))} g` : s(d.menge);
      return [`${amount} ${s(d.art)}`.trim(), d.reaktion && d.reaktion !== "unauffällig" ? s(d.reaktion) : ""].filter(Boolean).join(" · ");
    }
    case "kot":
      return [s(d.form), s(d.farbe), ...(Array.isArray(d.auff) ? (d.auff as string[]) : []), s(d.menge)].filter(Boolean).join(" · ") || "Kot";
    case "urin":
      return ["Urin", s(d.menge)].filter(Boolean).join(" · ");
    case "gassi":
      return [
        num(d.min) != null ? `${fmtNum(num(d.min))} min` : "",
        num(d.langsam) != null ? `langsamer nach ${fmtNum(num(d.langsam))} min` : "",
        d.energie ? `Energie ${s(d.energie)}` : "",
        d.atemDanach ? `Atmung danach ${s(d.atemDanach)}` : "",
      ].filter(Boolean).join(" · ") || "Gassi";
    case "erbrechen":
      return [s(d.inhalt), d.blut === "ja" ? "mit Blut" : "kein Blut"].filter(Boolean).join(" · ");
    case "husten":
      return [`${fmtNum(num(d.anzahl) ?? 1)}×`, s(d.art)].filter(Boolean).join(" ");
    case "med":
      return [s(d.name), s(d.dosis), s(d.grund)].filter(Boolean).join(" · ");
    case "notiz":
      return [d.befinden ? `Befinden ${optLabel("notiz", "befinden", d.befinden)}` : "", ...(Array.isArray(d.tags) ? (d.tags as string[]) : [])].filter(Boolean).join(" · ");
  }
  return "";
}

export interface Alert {
  level: "crit" | "warn" | "info";
  text: string;
}

/** Warnhinweis zu einem Eintrag nach den Regeln aus dem Behandlungsplan. */
export function entryAlert(e: Pick<Entry, "type" | "data">): Alert | null {
  const d = (e.data || {}) as Record<string, unknown>;
  if (e.type === "kot") {
    if (d.farbe === "schwarz, klebrig") return { level: "crit", text: "Schwarzer, klebriger Kot: Klinik anrufen. Für die Klinik etwas Kot auf Küchenpapier mit Wasser verreiben; ein rötlicher Rand spricht für Blut." };
    if (Array.isArray(d.auff) && (d.auff as string[]).includes("frisches Blut")) return { level: "warn", text: "Frisches Blut im Kot: bei der nächsten Rücksprache erwähnen; bei mehr als Schlieren oder wiederholt sofort anrufen." };
  }
  if (e.type === "erbrechen") {
    if (d.blut === "ja") return { level: "crit", text: "Erbrechen mit Blut: Klinik anrufen." };
    return { level: "info", text: "Kam es innerhalb von 30 Minuten nach einer Tablette, die Tablette nicht nachgeben und die Klinik fragen." };
  }
  if (e.type === "spo2") {
    const p = num(d.pct);
    if (d.pulsOk === "nein") return { level: "info", text: "Gerätepuls passt nicht zum Herzschlag: Wert nicht verwertbar. Sensor neu anlegen und wiederholen." };
    if (p != null && p < 90) return { level: "crit", text: "SpO₂ unter 90 %: Sauerstoff (Flow-by) vor die Nase halten und sofort die Klinik anrufen." };
    if (p != null && p < 95) return { level: "warn", text: `SpO₂ ${fmtNum(p)} %: Flow-by vor die Nase, in 10 Minuten an derselben Stelle wiederholen. Bleibt der Wert unter 95 %, Klinik anrufen.` };
  }
  if (e.type === "notiz" && d.befinden === "schlecht") {
    return { level: "warn", text: "Befinden „schlecht“ eingetragen: Warnzeichen prüfen (rote Taste oben) und bei Bedarf die Klinik anrufen." };
  }
  if (e.type === "futter" && d.reaktion === "Schmerzreaktion") {
    return { level: "warn", text: "Schmerzreaktion nach dem Fressen: Portionen verkleinern. Bei deutlichen Schmerzen Klinik anrufen und kein eigenes Schmerzmittel geben." };
  }
  return null;
}
