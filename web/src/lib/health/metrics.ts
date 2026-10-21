// Kategorien und Messwerte im Aufbau der Health-App, bezogen auf Spottys Protokoll.
// Jede Kategorie hat eine Farbe (CSS-Variable --c-<id>) und ein Symbol; jeder Messwert sagt,
// woraus er gebildet wird und wie er zusammengefasst wird.

import type { EntryType } from "@shared/types.ts";

export type CatId = "ausscheidung" | "befinden" | "bewegung" | "ernaehrung" | "atmung" | "koerper" | "medikamente" | "schlaf" | "symptome" | "vital" | "andere";

export interface CatDef {
  id: CatId;
  label: string;
  glyph: string;
}

/** Reihenfolge wie im Raster „Entdecken“: alphabetisch, „Andere Daten“ am Schluss. */
export const CATS: CatDef[] = [
  { id: "ausscheidung", label: "Ausscheidung", glyph: "hydrant" },
  { id: "befinden", label: "Befinden", glyph: "smile" },
  { id: "bewegung", label: "Bewegung", glyph: "paw" },
  { id: "ernaehrung", label: "Ernährung", glyph: "bowl" },
  { id: "atmung", label: "Herz und Lunge", glyph: "lungs" },
  { id: "koerper", label: "Körpermaße", glyph: "scale" },
  { id: "medikamente", label: "Medikamente", glyph: "capsule" },
  { id: "schlaf", label: "Schlaf", glyph: "moon" },
  { id: "symptome", label: "Symptome", glyph: "symptom" },
  { id: "vital", label: "Vitalzeichen", glyph: "pulse" },
  { id: "andere", label: "Andere Daten", glyph: "notes" },
];

export function catOf(id: string): CatDef | undefined {
  return CATS.find((c) => c.id === id);
}

export function catColor(id: CatId): string {
  return `var(--c-${id})`;
}

/**
 * Zusammenfassung eines Messwerts:
 * sum   – Mengen, die sich über den Tag addieren (ml, g, Minuten, Hustenanfälle)
 * count – Häufigkeit (Kot, Urin, Erbrechen, Beobachtungen)
 * range – Einzelmessungen mit Bereich (Atemzüge, Sättigung, Puls)
 * point – ein Wert, der sich langsam ändert (Gewicht)
 * state – Einschätzungen in Stufen (Nacht, Befinden)
 * plan  – Anteil erledigter Planpunkte
 */
export type Agg = "sum" | "count" | "range" | "point" | "state" | "plan";

export interface StateDef {
  v: string;
  label: string;
  /** 0 = gut, 1 = mittel, 2 = schlecht */
  level: 0 | 1 | 2;
}

export interface MetricDef {
  id: string;
  label: string;
  cat: CatId;
  /** weitere Kategorien, in denen der Wert ebenfalls erscheint */
  also?: CatId[];
  glyph: string;
  agg: Agg;
  /** Einheit hinter der Zahl */
  unit: string;
  /** Einzahl der Einheit, falls sie sich unterscheidet („1 Foto“) */
  unit1?: string;
  dec?: number;
  /** Eintragsart für „+“ und Schnell eintragen; tag = vorgewählte Schnellauswahl einer Beobachtung */
  entry?: { type: EntryType; tag?: string; field?: string } | { special: "nacht" | "foto" };
  /** Kopfzahl über mehrere Tage: Durchschnitt pro Tag oder Summe im Zeitraum */
  head?: "avg" | "total";
  states?: StateDef[];
  /** Orientierungslinie im Diagramm */
  ref?: { value: number; label: string };
  /** Herkunft aus der Schnellauswahl der Beobachtungen */
  tag?: string;
  about: string;
}

const TAG_ABOUT = (tag: string, extra = "") => `Aus den Beobachtungen im Protokoll, Schnellauswahl „${tag}“. Gezählt wird jede Beobachtung mit dieser Auswahl.${extra ? ` ${extra}` : ""}`;

export const NIGHT_STATES: StateDef[] = [
  { v: "ruhig", label: "ruhig", level: 0 },
  { v: "unruhig", label: "unruhig", level: 1 },
  { v: "sehr unruhig", label: "sehr unruhig", level: 2 },
];

export const MOOD_STATES: StateDef[] = [
  { v: "gut", label: "gut", level: 0 },
  { v: "unsicher", label: "nicht sicher", level: 1 },
  { v: "schlecht", label: "schlecht", level: 2 },
];

export const METRICS: MetricDef[] = [
  {
    id: "atem",
    label: "Atemzüge",
    cat: "atmung",
    also: ["vital"],
    glyph: "lungs",
    agg: "range",
    unit: "Atemzüge/min",
    entry: { type: "atem" },
    ref: { value: 40, label: "40" },
    about:
      "Atemzüge pro Minute in Ruhe, am besten im Schlaf gezählt. Ein Atemzug ist einmal Heben und Senken des Brustkorbs; beim Hecheln wird nicht gezählt. Bei Hunden mit Herzklappenerkrankung gilt eine Schlafatemfrequenz über 40 pro Minute als Warnzeichen, gesunde Hunde liegen meist unter 30. Entscheidend ist vor allem die Richtung unter der Behandlung. Zählungen nach Bewegung erscheinen als leere Kreise und gehen nicht in den Bereich ein.",
  },
  {
    id: "spo2",
    label: "Sauerstoffsättigung",
    cat: "atmung",
    also: ["vital"],
    glyph: "o2",
    agg: "range",
    unit: "%",
    entry: { type: "spo2" },
    ref: { value: 95, label: "95" },
    about:
      "Gemessen mit dem Pulsoximeter, erst nach 15–20 Minuten Ruhe; es gilt der Wert, der 20–30 Sekunden stabil steht. 95 % und mehr ist in Ordnung. Unter 95 %: Sauerstoff (Flow-by) vor die Nase halten und nach 10 Minuten an derselben Stelle wiederholen; bleibt der Wert darunter, die Klinik anrufen. Unter 90 % sofort anrufen. Messungen, bei denen der Gerätepuls nicht zum Herzschlag passte, zählen nicht.",
  },
  {
    id: "puls",
    label: "Puls",
    cat: "atmung",
    also: ["vital"],
    glyph: "heart",
    agg: "range",
    unit: "Schläge/min",
    entry: { type: "spo2" },
    about: "Puls laut Pulsoximeter, eingetragen zusammen mit der Sättigung. Verwertbar ist er nur, wenn er zum Herzschlag passt: Hand links an den Brustkorb legen, 15 Sekunden zählen und mal 4 nehmen.",
  },
  {
    id: "husten",
    label: "Husten",
    cat: "symptome",
    also: ["atmung"],
    glyph: "cough",
    agg: "sum",
    unit: "Anfälle",
    unit1: "Anfall",
    head: "total",
    entry: { type: "husten" },
    about: "Hustenanfälle, wie sie im Protokoll eingetragen wurden, jeweils mit der Art: kurz zum Auspusten, mit Würgen oder feucht mit Schleim.",
  },
  {
    id: "trinken",
    label: "Getrunken",
    cat: "ernaehrung",
    glyph: "drop",
    agg: "sum",
    unit: "ml",
    head: "avg",
    entry: { type: "trinken" },
    about:
      "Alles, was Spotty trinkt, per Spritze oder selbst, in Millilitern. Per Spritze höchstens 50 ml auf einmal. Ist für einen Tag nur die Summe vom Papierprotokoll bekannt, zählt diese. Der Durchschnitt rechnet nur abgeschlossene Tage mit Angaben.",
  },
  {
    id: "futter",
    label: "Gefressen",
    cat: "ernaehrung",
    glyph: "bowl",
    agg: "sum",
    unit: "g",
    head: "avg",
    entry: { type: "futter" },
    about:
      "Gefressene Menge in Gramm; kleine, warme, breiige Portionen. Abgelehnte Mahlzeiten stehen im Tagesprotokoll und zählen hier nicht mit. Ist für einen Tag nur die Summe vom Papierprotokoll bekannt, zählt diese. Der Durchschnitt rechnet nur abgeschlossene Tage mit Angaben.",
  },
  {
    id: "gassi",
    label: "Gassi",
    cat: "bewegung",
    glyph: "paw",
    agg: "sum",
    unit: "min",
    head: "avg",
    entry: { type: "gassi" },
    about: "Dauer der Runden draußen in Minuten. Im Protokoll stehen dazu die Energie und ob er nach der Runde schneller geatmet hat.",
  },
  {
    id: "kot",
    label: "Kot",
    cat: "ausscheidung",
    glyph: "poop",
    agg: "count",
    unit: "×",
    head: "avg",
    entry: { type: "kot" },
    about: "Wie oft Kot abgesetzt wurde, mit Beschaffenheit und Farbe. Bei schwarzem, klebrigem Kot etwas auf Küchenpapier mit Wasser verreiben; ein rötlicher Rand spricht für Blut. Dann die Klinik anrufen.",
  },
  {
    id: "urin",
    label: "Urin",
    cat: "ausscheidung",
    glyph: "drop",
    agg: "count",
    unit: "×",
    head: "avg",
    entry: { type: "urin" },
    about: "Wie oft Urin abgesetzt wurde. Unter Cortison ist mehr Urin zu erwarten. Kein Urin über 12 Stunden: Klinik anrufen.",
  },
  {
    id: "erbrechen",
    label: "Erbrechen",
    cat: "symptome",
    glyph: "vomit",
    agg: "count",
    unit: "×",
    head: "total",
    entry: { type: "erbrechen" },
    about: "Jedes Erbrechen mit Inhalt und ob Blut dabei war. Kam es innerhalb von 30 Minuten nach einer Tablette, die Tablette nicht nachgeben und die Klinik fragen. Erbrechen mit Blut: Klinik anrufen.",
  },
  {
    id: "gewicht",
    label: "Gewicht",
    cat: "koerper",
    glyph: "scale",
    agg: "point",
    unit: "kg",
    dec: 1,
    entry: { type: "gewicht" },
    about: "Morgens vor dem Fressen wiegen, immer mit derselben Waage. Gewichte aus der Akte, etwa von Klinikbesuchen, erscheinen ebenfalls.",
  },
  {
    id: "nacht",
    label: "Nacht",
    cat: "schlaf",
    glyph: "moon",
    agg: "state",
    unit: "",
    states: NIGHT_STATES,
    entry: { special: "nacht" },
    about: "Wie die Nacht war: ruhig, unruhig oder sehr unruhig. Eingetragen wird sie im Tagesprotokoll unter „Notizen zum Tag“ oder hier mit „+“.",
  },
  {
    id: "befinden",
    label: "Befinden",
    cat: "befinden",
    glyph: "smile",
    agg: "state",
    unit: "",
    states: MOOD_STATES,
    entry: { type: "notiz", field: "befinden" },
    about: "Ein kurzer Eindruck, wie es Spotty gerade geht: gut, nicht sicher oder schlecht. Bei „schlecht“ zeigt die App die Warnzeichen und die Nummer der Klinik.",
  },
  { id: "munter", label: "Munter", cat: "befinden", glyph: "smile", agg: "count", unit: "×", head: "total", tag: "munter", entry: { type: "notiz", tag: "munter" }, about: TAG_ABOUT("munter") },
  { id: "spielt", label: "Spielt", cat: "befinden", glyph: "paw", agg: "count", unit: "×", head: "total", tag: "spielt", entry: { type: "notiz", tag: "spielt" }, about: TAG_ABOUT("spielt") },
  { id: "hecheln", label: "Hecheln", cat: "symptome", glyph: "wind", agg: "count", unit: "×", head: "total", tag: "hechelt viel", entry: { type: "notiz", tag: "hechelt viel" }, about: TAG_ABOUT("hechelt viel", "Cortison kann Hecheln auslösen; beim Hecheln keine Atemzüge zählen.") },
  { id: "durst", label: "Viel Durst", cat: "symptome", glyph: "drop", agg: "count", unit: "×", head: "total", tag: "trinkt viel", entry: { type: "notiz", tag: "trinkt viel" }, about: TAG_ABOUT("trinkt viel") },
  { id: "heisshunger", label: "Heißhunger", cat: "symptome", glyph: "bowl", agg: "count", unit: "×", head: "total", tag: "frisst gierig", entry: { type: "notiz", tag: "frisst gierig" }, about: TAG_ABOUT("frisst gierig") },
  { id: "unruhe", label: "Unruhe", cat: "symptome", glyph: "symptom", agg: "count", unit: "×", head: "total", tag: "unruhig", entry: { type: "notiz", tag: "unruhig" }, about: TAG_ABOUT("unruhig") },
  { id: "pfoten", label: "Pfotenlecken", cat: "symptome", glyph: "paw", agg: "count", unit: "×", head: "total", tag: "Pfotenlecken", entry: { type: "notiz", tag: "Pfotenlecken" }, about: TAG_ABOUT("Pfotenlecken") },
  { id: "schmerz", label: "Schmerzzeichen", cat: "symptome", glyph: "symptom", agg: "count", unit: "×", head: "total", tag: "Schmerzzeichen", entry: { type: "notiz", tag: "Schmerzzeichen" }, about: TAG_ABOUT("Schmerzzeichen", "Kein eigenes Schmerzmittel geben; Schmerzmittel wie Meloxicam oder Carprofen nicht zusammen mit Cortison.") },
  { id: "abwesend", label: "Starrt, wirkt abwesend", cat: "symptome", glyph: "eye", agg: "count", unit: "×", head: "total", tag: "starrt / abwesend", entry: { type: "notiz", tag: "starrt / abwesend" }, about: TAG_ABOUT("starrt / abwesend") },
  { id: "schwach", label: "Schwach, müde", cat: "symptome", glyph: "moon", agg: "count", unit: "×", head: "total", tag: "schwach, müde", entry: { type: "notiz", tag: "schwach, müde" }, about: TAG_ABOUT("schwach, müde") },
  {
    id: "notiz",
    label: "Beobachtungen",
    cat: "andere",
    glyph: "eye",
    agg: "count",
    unit: "×",
    head: "total",
    entry: { type: "notiz" },
    about: "Freie Beobachtungen aus dem Protokoll, mit oder ohne Schnellauswahl.",
  },
  {
    id: "med",
    label: "Medikament außer Plan",
    cat: "andere",
    glyph: "capsule",
    agg: "count",
    unit: "×",
    head: "total",
    entry: { type: "med" },
    about: "Alles, was nicht im Behandlungsplan steht, mit Menge und Grund. Keine Schmerzmittel wie Meloxicam oder Carprofen zusammen mit Cortison geben.",
  },
  {
    id: "fotos",
    label: "Papierprotokoll",
    cat: "andere",
    glyph: "camera",
    agg: "count",
    unit: "Fotos",
    unit1: "Foto",
    head: "total",
    entry: { special: "foto" },
    about: "Fotos der handschriftlichen Protokolle. Claude kann die Zeilen auslesen und als Einträge vorschlagen; übernommen wird erst nach dem Prüfen.",
  },
  {
    id: "plan",
    label: "Tagesplan",
    cat: "medikamente",
    glyph: "calendar",
    agg: "plan",
    unit: "%",
    about:
      "Anteil der fälligen Medikamente, Inhalationen und Pflegepunkte, die gegeben oder erledigt wurden. Bewusst ausgelassene Punkte gelten als erledigt, zählen hier aber nicht als gegeben. Noch nicht fällige Punkte des laufenden Tages zählen erst ab ihrer Uhrzeit.",
  },
];

const BY_ID = new Map(METRICS.map((m) => [m.id, m]));

export function metricOf(id: string): MetricDef | undefined {
  return BY_ID.get(id);
}

export function metricsOfCat(cat: CatId): MetricDef[] {
  return METRICS.filter((m) => m.cat === cat || (m.also || []).includes(cat));
}

/** Messwert, der zu einer Eintragsart gehört (für Schnell eintragen und Rückwege). */
export function metricOfEntry(type: EntryType): MetricDef | undefined {
  return METRICS.find((m) => m.entry && "type" in m.entry && m.entry.type === type && !m.entry.tag && !m.entry.field) || METRICS.find((m) => m.entry && "type" in m.entry && m.entry.type === type);
}

/** Standard für „Angepinnt“ und „Schnell eintragen“ auf einem neuen Gerät. */
export const DEFAULT_PINNED = ["plan", "atem", "trinken", "futter", "spo2", "gewicht"];
export const DEFAULT_QUICK: EntryType[] = ["atem", "trinken", "futter", "kot", "urin", "notiz"];

/** Einheit passend zur Zahl: „1 Foto“, „2 Fotos“. */
export function unitFor(def: MetricDef, value: string): string {
  return value === "1" && def.unit1 ? def.unit1 : def.unit;
}
