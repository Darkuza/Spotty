// Medikamentenübersicht: ordnet Pläne, Häkchen, Einträge, Chronik und Fragen den Wirkstoffen des Katalogs zu,
// bestimmt den Stand (aktuell, geplant, früher, möglich) und beschreibt die Dosis aus dem Plan.
// Reine Funktionen ohne Oberfläche, damit sich die Zuordnung prüfen lässt.

import type { Check, Entry, Question, Regimen, Step, TimelineEvent } from "@shared/types.ts";
import { addDays, WD_SHORT } from "@shared/dates.ts";
import { fmtAmount, nextChange, phases, stepFor } from "@shared/plan.ts";
import { SUBSTANCES, type Substance } from "../features/medications/catalog";
import { fmtDayMonthShort, fmtWhen } from "./health/format";

export type MedStatus = "aktuell" | "geplant" | "frueher" | "moeglich";

export const STATUS_ORDER: MedStatus[] = ["aktuell", "geplant", "frueher", "moeglich"];

export const STATUS_TITLE: Record<MedStatus, string> = {
  aktuell: "Aktuell",
  geplant: "Geplant",
  frueher: "Früher",
  moeglich: "Möglich",
};

// ---------------------------------------------------------------------------
// Wörter finden
// ---------------------------------------------------------------------------

interface Span {
  /** kleingeschriebenes Wort ohne Umlautpunkte */
  t: string;
  /** Anfang und Ende im Originaltext */
  s: number;
  e: number;
}

/** Zerlegt Text in Wörter („Käse“ → „kase“) und merkt sich, wo sie im Originaltext stehen. */
export function spansOf(text: string): Span[] {
  let norm = "";
  const back: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    const ch = String.fromCodePoint(cp);
    const n = ch
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "");
    for (let k = 0; k < n.length; k++) back.push(i);
    norm += n;
    i += ch.length;
  }
  const out: Span[] = [];
  const re = /[a-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) out.push({ t: m[0], s: back[m.index], e: back[m.index + m[0].length - 1] + 1 });
  return out;
}

export function tokensOf(text: string): string[] {
  return spansOf(text).map((x) => x.t);
}

interface Index {
  substance: Substance;
  names: string[][];
  similar: string[][];
}

const INDEX: Index[] = SUBSTANCES.map((substance) => ({
  substance,
  names: substance.aliases.map(tokensOf),
  similar: (substance.similar || []).map(tokensOf),
}));

/** Kurze Namen müssen genau stimmen („Sole“, „MCP“), längere dürfen weitergehen („Omeprazol-ratiopharm“). */
function firstHit(spans: Span[], alias: string[]): number {
  for (let i = 0; i + alias.length <= spans.length; i++) {
    let ok = true;
    for (let j = 0; j < alias.length && ok; j++) {
      const a = alias[j];
      const t = spans[i + j].t;
      ok = a.length < 5 ? t === a : t.startsWith(a);
    }
    if (ok) return spans[i].s;
  }
  return -1;
}

export interface Hit {
  substance: Substance;
  /** Stelle im Text */
  at: number;
  /** nur über einen Oberbegriff oder eine vermutete Schreibweise gefunden */
  guess: boolean;
}

/** Welche Wirkstoffe kommen im Text vor? Namen zuerst, dann Oberbegriffe und Schreibweisen der Familie (Vermutung). */
export function matchSubstances(text: string | null | undefined): Hit[] {
  if (!text) return [];
  const spans = spansOf(text);
  const hits: Hit[] = [];
  for (const e of INDEX) {
    let at = -1;
    for (const a of e.names) {
      const p = firstHit(spans, a);
      if (p >= 0 && (at < 0 || p < at)) at = p;
    }
    if (at >= 0) {
      hits.push({ substance: e.substance, at, guess: false });
      continue;
    }
    for (const a of e.similar) {
      const p = firstHit(spans, a);
      if (p >= 0 && (at < 0 || p < at)) at = p;
    }
    if (at >= 0) hits.push({ substance: e.substance, at, guess: true });
  }
  return hits.sort((a, b) => a.at - b.at);
}

/** Satzende nach Zeichen i: Punkt, Ausrufe- oder Fragezeichen vor Leerraum und Großbuchstaben; „i.v.“, „10.“ und „ca.“ zählen nicht. */
function endsSentence(text: string, i: number): boolean {
  const c = text[i];
  if (c === "\n") return true;
  if (c !== "." && c !== "!" && c !== "?") return false;
  const rest = text.slice(i + 1, i + 12);
  if (!/^\s/.test(rest) || /^\s*\p{Ll}/u.test(rest)) return false;
  return c !== "." || /\p{L}{3,}$/u.test(text.slice(Math.max(0, i - 12), i));
}

/** Textausschnitt um eine Fundstelle: der Satz mit dem Treffer, bei langen Sätzen an Wortgrenzen gekürzt. */
export function snippetAround(text: string, at: number, max = 170): string {
  let from = Math.max(0, at - 90);
  let clippedStart = from > 0;
  for (let i = at - 1; i >= from; i--) {
    if (endsSentence(text, i)) {
      from = i + 1;
      clippedStart = false;
      break;
    }
  }
  let to = Math.min(text.length, from + max);
  let clippedEnd = to < text.length;
  for (let i = at; i < to; i++) {
    if (endsSentence(text, i)) {
      to = i + 1;
      clippedEnd = false;
      break;
    }
  }
  let s = text.slice(from, to);
  if (clippedStart && !/\s/.test(text[from - 1])) s = s.replace(/^\S*\s+/, "");
  if (clippedEnd && !/\s/.test(text[to])) s = s.replace(/\s+\S*$/, "");
  s = s.replace(/\s+/g, " ").trim();
  return `${clippedStart ? "… " : ""}${s}${clippedEnd ? " …" : ""}`;
}

// ---------------------------------------------------------------------------
// Pläne
// ---------------------------------------------------------------------------

export const isMedRegimen = (r: Regimen) => r.category === "med" || r.category === "inh";

/** Wirkstoff eines Plans, gelesen aus Name oder Zweck; Oberbegriffe wie „Cortison“ reichen dafür nicht. */
export function substanceOfRegimen(r: Regimen): Substance | null {
  for (const text of [r.name, r.purpose]) {
    const hit = matchSubstances(text).find((h) => !h.guess);
    if (hit) return hit.substance;
  }
  return null;
}

/** Name eines Plans, der nur über den Zweck einem Wirkstoff zugeordnet ist (etwa ein Handelsname). */
interface PlanName {
  substance: Substance;
  alias: string[];
}

/** Solche Namen gelten auch in Einträgen, Chronik und Fragen: Was die Familie im Plan so nennt, meint denselben Wirkstoff. */
export function planNames(regimens: Regimen[]): PlanName[] {
  const out: PlanName[] = [];
  for (const r of regimens.filter(isMedRegimen)) {
    const s = substanceOfRegimen(r);
    if (!s || matchSubstances(r.name).some((h) => !h.guess && h.substance.id === s.id)) continue;
    const alias = tokensOf(r.name);
    if (alias.some((t) => t.length >= 5)) out.push({ substance: s, alias });
  }
  return out;
}

/** Wie `matchSubstances`, dazu die Namen aus dem Plan. */
function matchWithPlan(text: string | null | undefined, names: PlanName[]): Hit[] {
  const hits = matchSubstances(text);
  if (!text || !names.length) return hits;
  const spans = spansOf(text);
  for (const n of names) {
    const at = firstHit(spans, n.alias);
    if (at < 0) continue;
    const cur = hits.find((h) => h.substance.id === n.substance.id);
    if (!cur) hits.push({ substance: n.substance, at, guess: false });
    else {
      cur.guess = false;
      cur.at = Math.min(cur.at, at);
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

export type PlanState = "aktuell" | "geplant" | "frueher";

/** aktuell: heute in einer Stufe; geplant: Stufe beginnt später oder noch keine Stufen; früher: alle Stufen vorbei oder pausiert. */
export function planState(r: Regimen, today: string): PlanState {
  if (!r.active) return "frueher";
  const ph = phases(r, today);
  if (ph.some((p) => p.current)) return "aktuell";
  if (!ph.length || ph.some((p) => !p.past)) return "geplant";
  return "frueher";
}

// ---------------------------------------------------------------------------
// Liste aufbauen
// ---------------------------------------------------------------------------

export interface Evidence {
  kind: "eintrag" | "ereignis" | "frage";
  key: string;
  /** Tag (bei Einträgen der erste Tag), leer bei Fragen ohne Datum */
  day: string;
  /** letzter Tag, wenn mehrere Einträge zusammengefasst sind */
  until?: string;
  title: string;
  /** Ausschnitt aus dem Text der Chronik, in dem der Wirkstoff vorkommt */
  text?: string;
  count?: number;
  /** nur über Oberbegriff oder vermutete Schreibweise zugeordnet */
  guess: boolean;
  /** belegt eine Behandlung (Eintrag, Therapie oder Klinik) und nicht nur eine Erwähnung */
  given: boolean;
  eventId?: string;
  documentId?: string | null;
  state?: Question["status"];
}

export interface MedItem {
  /** Wirkstoff-Kennung aus dem Katalog, sonst „r-<Plan>“ oder „e-<Name>“ */
  key: string;
  name: string;
  substance: Substance | null;
  status: MedStatus;
  /** Stand beruht nur auf vermuteten Zuordnungen */
  guess: boolean;
  regimens: Regimen[];
  evidence: Evidence[];
  /** letzter Tag mit Gabe oder Erwähnung */
  last: string | null;
  /** letzter Tag mit Gabe (Häkchen, Eintrag, Therapie) */
  lastGiven: string | null;
  paused: boolean;
}

export interface MedInput {
  regimens: Regimen[];
  entries: Entry[];
  events: TimelineEvent[];
  questions: Question[];
  checks: Check[];
  today: string;
}

/** Ereignisse dieser Kategorien gelten als Behandlung, alle anderen nur als Erwähnung. */
const GIVEN_CATEGORIES = new Set(["therapie", "klinik"]);

const NO_NAME = new Set(["nicht", "bezeichnet", "unbekannt", "ohne", "name", "medikament", "medikamente", "mittel", "tablette", "tabletten", "unklar", "sonstiges", "sonstige"]);

/** Name eines Mittels aus einem Eintrag, ohne Klammern und Dosis („Testtropfen 5 ml“ → „Testtropfen“). */
function freeName(raw: string): string | null {
  const cleaned = raw.replace(/\([^)]*\)/g, " ").split(/\s+\d/)[0].replace(/\s+/g, " ").trim();
  const toks = tokensOf(cleaned);
  if (!toks.length || toks.every((t) => NO_NAME.has(t) || t.length < 2)) return null;
  return cleaned;
}

function maxDay(days: (string | null | undefined)[]): string | null {
  let m: string | null = null;
  for (const d of days) if (d && (!m || d > m)) m = d;
  return m;
}

const byDayDesc = (a: Evidence, b: Evidence) => (a.day === b.day ? a.title.localeCompare(b.title, "de") : !a.day ? 1 : !b.day ? -1 : b.day.localeCompare(a.day));

export function buildMedications(inp: MedInput): MedItem[] {
  const { regimens, entries, events, questions, checks, today } = inp;
  const items = new Map<string, MedItem>();
  const names = planNames(regimens);

  const ensure = (key: string, name: string, substance: Substance | null): MedItem => {
    let it = items.get(key);
    if (!it) {
      it = { key, name, substance, status: "moeglich", guess: false, regimens: [], evidence: [], last: null, lastGiven: null, paused: false };
      items.set(key, it);
    }
    return it;
  };
  const forSubstance = (s: Substance) => ensure(s.id, s.name, s);

  // 1. Pläne
  for (const r of regimens.filter(isMedRegimen)) {
    const s = substanceOfRegimen(r);
    (s ? forSubstance(s) : ensure(`r-${r.id}`, r.name, null)).regimens.push(r);
  }

  // 2. Einträge vom Typ „med“, je Name zusammengefasst
  const groups = new Map<string, { item: MedItem; name: string; days: string[]; guess: boolean }>();
  for (const e of entries) {
    if (e.type !== "med") continue;
    const raw = String(e.data?.name ?? "").trim();
    if (!raw) continue;
    const hits = matchWithPlan(raw, names);
    const targets: { item: MedItem; guess: boolean }[] = [];
    if (hits.length) {
      for (const h of hits) targets.push({ item: forSubstance(h.substance), guess: h.guess });
    } else {
      const name = freeName(raw);
      if (!name) continue;
      const slug = tokensOf(name).join("-");
      // gehört der Name zu einem Plan ohne bekannten Wirkstoff, landen beide in derselben Zeile
      const same = [...items.values()].find((i) => !i.substance && tokensOf(i.name).join("-") === slug);
      targets.push({ item: same || ensure(`e-${slug}`, name, null), guess: false });
    }
    for (const t of targets) {
      const gk = `${t.item.key}|${tokensOf(raw).join(" ")}`;
      const g = groups.get(gk) || { item: t.item, name: raw, days: [], guess: t.guess };
      g.days.push(e.day);
      groups.set(gk, g);
    }
  }
  for (const [gk, g] of groups) {
    const days = [...g.days].sort();
    g.item.evidence.push({
      kind: "eintrag",
      key: `en-${gk}`,
      day: days[0],
      until: days[days.length - 1] !== days[0] ? days[days.length - 1] : undefined,
      title: g.name,
      count: days.length,
      guess: g.guess,
      given: true,
    });
  }

  // 3. Chronik
  for (const ev of events) {
    const found = new Map<string, { substance: Substance; guess: boolean; inTitle: boolean; textAt: number }>();
    for (const h of matchWithPlan(ev.title, names)) found.set(h.substance.id, { substance: h.substance, guess: h.guess, inTitle: true, textAt: -1 });
    for (const h of matchWithPlan(ev.text, names)) {
      const cur = found.get(h.substance.id);
      if (!cur) found.set(h.substance.id, { substance: h.substance, guess: h.guess, inTitle: false, textAt: h.at });
      else {
        cur.textAt = h.at;
        cur.guess = cur.guess && h.guess;
      }
    }
    const given = GIVEN_CATEGORIES.has(ev.category);
    for (const f of found.values()) {
      // Ein Oberbegriff wie „Cortison“ in einem Gespräch sagt nichts über ein bestimmtes Mittel; nur Behandlungen zählen als Hinweis.
      if (f.guess && !given) continue;
      forSubstance(f.substance).evidence.push({
        kind: "ereignis",
        key: `ev-${ev.id}`,
        day: ev.date,
        title: ev.title,
        text: !f.inTitle && f.textAt >= 0 && ev.text ? snippetAround(ev.text, f.textAt) : undefined,
        guess: f.guess,
        given,
        eventId: ev.id,
        documentId: ev.document_id,
      });
    }
  }

  // 4. Fragen an die Klinik
  for (const q of questions) {
    const found = new Map<string, { substance: Substance; guess: boolean }>();
    for (const h of [...matchWithPlan(q.text, names), ...matchWithPlan(q.answer, names)]) {
      const cur = found.get(h.substance.id);
      if (!cur) found.set(h.substance.id, { substance: h.substance, guess: h.guess });
      else cur.guess = cur.guess && h.guess;
    }
    for (const f of found.values()) {
      if (f.guess) continue;
      forSubstance(f.substance).evidence.push({
        kind: "frage",
        key: `q-${q.id}`,
        day: (q.created_at || "").slice(0, 10),
        title: q.text,
        guess: f.guess,
        given: false,
        state: q.status,
      });
    }
  }

  // 5. Häkchen der Plan-Uhrzeiten → letzte Gabe
  const slotOwner = new Map<string, MedItem>();
  for (const it of items.values()) for (const r of it.regimens) for (const s of r.slots || []) if (s.key) slotOwner.set(s.key, it);
  const checked = new Map<MedItem, string[]>();
  for (const c of checks) {
    if (c.skipped) continue;
    const it = slotOwner.get(c.slot);
    if (it) (checked.get(it) || checked.set(it, []).get(it)!).push(c.day);
  }

  // 6. Stand bestimmen
  for (const it of items.values()) {
    it.regimens.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "de"));
    it.evidence.sort(byDayDesc);
    const states = it.regimens.map((r) => planState(r, today));
    const given = it.evidence.filter((e) => e.given);
    it.paused = it.regimens.length > 0 && it.regimens.every((r) => !r.active);
    // So wie die Familie es im Plan nennt (etwa die Handelsnamen), sonst der Wirkstoffname
    if (it.substance && it.regimens.length) it.name = it.regimens[0].name;
    if (states.includes("aktuell")) it.status = "aktuell";
    else if (states.includes("geplant")) it.status = "geplant";
    else if (states.length || given.length) it.status = "frueher";
    else it.status = "moeglich";
    it.guess = it.status === "frueher" && !states.length && !given.some((e) => !e.guess);
    it.lastGiven = maxDay([...(checked.get(it) || []), ...given.map((e) => e.until || e.day)]);
    it.last = maxDay([it.lastGiven, ...it.evidence.map((e) => e.until || e.day)]);
  }

  const rank = (it: MedItem) => (it.regimens.length ? it.regimens[0].sort : Infinity);
  return [...items.values()].sort((a, b) => {
    const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (s) return s;
    if (a.status === "aktuell" || a.status === "geplant") return rank(a) - rank(b) || a.name.localeCompare(b.name, "de");
    if (a.status === "frueher" && a.last !== b.last) return !a.last ? 1 : !b.last ? -1 : b.last.localeCompare(a.last);
    return a.name.localeCompare(b.name, "de");
  });
}

/** Zeile zu einer Kennung; alte Adressen mit der Plan-Kennung (z. B. „sole“) finden ebenfalls ihre Zeile. */
export function findMedication(items: MedItem[], key: string): MedItem | null {
  return items.find((i) => i.key === key) || items.find((i) => i.regimens.some((r) => r.id === key)) || null;
}

export function sectionsOf(items: MedItem[]): { status: MedStatus; items: MedItem[] }[] {
  return STATUS_ORDER.map((status) => ({ status, items: items.filter((i) => i.status === status) })).filter((s) => s.items.length);
}

// ---------------------------------------------------------------------------
// Dosis aus dem Plan
// ---------------------------------------------------------------------------

export interface DoseInfo {
  /** Hauptzeile, z. B. „2 × 10 mg täglich“ */
  headline: string;
  /** Uhrzeiten, z. B. „07:00 und 19:00 Uhr“ */
  times: string;
  /** Hinweis aus dem Plan, z. B. „½ Tablette“ */
  hint: string;
  /** Tagessumme bei mehreren Gaben, z. B. „zusammen 20 mg am Tag“ */
  total: string | null;
  /** bei jedem zweiten Tag oder festen Wochentagen: heute nicht dran */
  today: string | null;
  /** nächste Änderung des Plans */
  next: string | null;
}

export function listDe(xs: string[]): string {
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs[xs.length - 1]}`;
}

/** „20 mg“ → 20 und „mg“; „¾ Beutel“ → 0,75 und „Beutel“; alles andere (etwa „2x10 mg“) bleibt unverändert stehen. */
export function parseDose(dose: string | null | undefined): { value: number; unit: string } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?|[¼½¾])\s*([^\d\s][^\d]*?)?\s*$/.exec(dose || "");
  if (!m) return null;
  const v = m[1] === "¼" ? 0.25 : m[1] === "½" ? 0.5 : m[1] === "¾" ? 0.75 : Number(m[1].replace(",", "."));
  if (!isFinite(v) || v <= 0) return null;
  return { value: v, unit: (m[2] || "").trim() };
}

const METRIC = /^(mg|µg|μg|mcg|g|kg|ml|l|ie)(\/.*)?$/i;

function fmtVal(v: number, unit: string): string {
  const r = Math.round(v * 100) / 100;
  return METRIC.test(unit) ? String(r).replace(".", ",") : fmtAmount(r);
}

/** Rhythmus ohne Zusatz („täglich“, „jeden zweiten Tag“, „Mo, Mi, Fr“), wie ihn der Plan im Hinweis schreibt. */
export function rhythmOf(s: Step): string {
  if (s.pattern === "alternate") return "jeden zweiten Tag";
  if (s.pattern === "weekdays") return (s.weekdays || []).map((w) => WD_SHORT[w]).join(", ");
  return "täglich";
}

function timesOf(r: Regimen): string {
  const t = (r.slots || []).map((s) => s.time).filter(Boolean);
  return t.length ? `${listDe(t)} Uhr` : "";
}

function stepLine(r: Regimen, s: Step) {
  const n = Math.max(1, (r.slots || []).length);
  const rh = rhythmOf(s);
  const rhText = s.pattern === "weekdays" ? `an ${rh}` : rh;
  // Ohne Mengenangabe im Plan bleibt der Rhythmus: „2 × täglich“, „täglich“
  const dose = s.dose ? (n > 1 ? `${n} × ${s.dose} ` : `${s.dose} `) : n > 1 ? `${n} × ` : "";
  const parsed = parseDose(s.dose);
  const total = n > 1 && (s.pattern || "daily") === "daily" && parsed && parsed.unit ? `zusammen ${fmtVal(parsed.value * n, parsed.unit)} ${parsed.unit} am Tag` : null;
  const hint = s.label && !s.label.startsWith(rh) ? s.label : "";
  return { headline: `${dose}${rhText}`, total, hint };
}

/** Dosis eines Plans für heute: aktuelle Stufe, sonst die nächste oder (bei beendeten Plänen) die letzte. */
export function doseInfo(r: Regimen, today: string): DoseInfo {
  const times = timesOf(r);
  const state = planState(r, today);
  const steps = r.steps || [];
  const empty = { total: null, today: null, next: null, hint: "" };
  if (state === "aktuell") {
    const cur = phases(r, today).find((p) => p.current)!.step;
    const line = stepLine(r, cur);
    const nc = nextChange(r, today);
    return {
      headline: line.headline.charAt(0).toUpperCase() + line.headline.slice(1),
      times,
      hint: line.hint,
      total: line.total,
      today: stepFor(r, today) ? null : "Heute nicht dran",
      next: nc ? (nc.step ? `Ab ${fmtDayMonthShort(nc.day)}: ${nc.step.dose || "neue Stufe"}` : `Läuft bis ${fmtDayMonthShort(addDays(nc.day, -1))}`) : null,
    };
  }
  if (state === "geplant") {
    const later = steps.filter((s) => s.from > today).sort((a, b) => a.from.localeCompare(b.from))[0];
    if (!later) return { ...empty, headline: "Noch nicht begonnen", times };
    const line = stepLine(r, later);
    return { ...empty, headline: `Ab ${fmtDayMonthShort(later.from)}: ${line.headline}`, times, hint: line.hint, total: line.total };
  }
  if (!r.active) return { ...empty, headline: "Pausiert", times };
  const lastStep = [...steps].sort((a, b) => (b.to || "").localeCompare(a.to || ""))[0];
  return { ...empty, headline: lastStep?.to ? `Plan beendet am ${fmtDayMonthShort(lastStep.to)}` : "Plan beendet", times };
}

// ---------------------------------------------------------------------------
// Texte für die Liste
// ---------------------------------------------------------------------------

export function whenText(day: string, today: string): string {
  if (day === today) return "heute";
  if (day === addDays(today, -1)) return "gestern";
  return fmtWhen(day, null, today);
}

export function groupOf(it: MedItem): string {
  if (it.substance) return it.substance.group;
  if (it.regimens.some((r) => r.category === "inh")) return "Inhalation";
  return it.regimens.length ? "Medikament" : "Aus den Einträgen";
}

/** Symbol der Zeile: das des Wirkstoffs, sonst Kapsel oder (bei Inhalationen) Wind. */
export function glyphOf(it: MedItem): string {
  if (it.substance) return it.substance.glyph;
  return it.regimens.some((r) => r.category === "inh") ? "wind" : "capsule";
}

/** Zweite Zeile der Liste. */
export function rowSub(it: MedItem, today: string): string {
  switch (it.status) {
    case "aktuell": {
      const parts = it.regimens
        .filter((r) => planState(r, today) === "aktuell")
        .map((r) => {
          const d = doseInfo(r, today);
          return [d.headline, d.times].filter(Boolean).join(" · ");
        });
      return parts.join(" · ");
    }
    case "geplant": {
      const r = it.regimens.find((x) => planState(x, today) === "geplant") as Regimen;
      const d = doseInfo(r, today);
      return [d.headline, d.times].filter(Boolean).join(" · ");
    }
    case "frueher": {
      const parts = [groupOf(it)];
      if (it.paused) parts.push("pausiert");
      else if (it.lastGiven || it.last) parts.push(`zuletzt ${whenText((it.lastGiven || it.last) as string, today)}`);
      if (it.guess) parts.push("Zuordnung vermutet");
      return parts.join(" · ");
    }
    default:
      return `${groupOf(it)} · ${it.evidence.some((e) => e.kind === "frage") ? "in Fragen an die Klinik" : "in der Akte erwähnt"}`;
  }
}
