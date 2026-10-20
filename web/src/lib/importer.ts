// Import der Akte aus einer Bundle-Datei („spotty-akte“, Version 1) und Sicherung aller Daten als JSON.
// Die Bundle-Datei entsteht außerhalb des Repositorys (tools/build-bundle.mjs) und enthält Stammdaten,
// Behandlungsplan, Dokumente samt Originaldateien (base64), Laborwerte, Chronik, Fragen, Protokolleinträge und Fotos.

import { backend } from "./config";
import { store } from "./store";
import type { TableName } from "./backend";
import { safeName } from "./files";
import type { Check, Doc, DocFile, Entry, EntryType, Lab, Photo, ProfileData, Question, Regimen, TimelineEvent } from "@shared/types.ts";
import { TYPES } from "@shared/entryTypes.ts";
import { isValidDay, isValidHm } from "@shared/dates.ts";

interface BundleFile {
  name: string;
  mime?: string;
  data?: string;
}

export interface Bundle {
  format: "spotty-akte";
  version: number;
  created?: string;
  profile?: ProfileData;
  regimens?: Regimen[];
  documents?: (Omit<Doc, "files"> & { files?: BundleFile[] })[];
  labs?: Omit<Lab, "id">[];
  events?: Omit<TimelineEvent, "id">[];
  questions?: Omit<Question, "id">[];
  entries?: { day: string; time: string; type: string; data: Record<string, unknown>; slot?: string | null }[];
  /** abgehakte Planpunkte, z. B. aus übertragenen Papierprotokollen */
  checks?: { day: string; slot: string; time: string; note?: string | null }[];
  photos?: { day: string; time: string; file: string; mime?: string; data?: string; note?: string | null }[];
}

export interface ImportSummary {
  profile: boolean;
  regimens: number;
  documents: number;
  files: number;
  labs: number;
  events: number;
  questions: number;
  entries: number;
  checks: number;
  photos: number;
  skipped: number;
  warnings: string[];
}

export type Progress = (text: string, done: number, total: number) => void;

/** Stabile UUID aus einem Schlüsseltext (SHA-1, Format wie UUID v5), damit ein zweiter Import nichts verdoppelt. */
async function stableId(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`spotty:${key}`));
  const b = new Uint8Array(buf).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function blobOf(data: string, mime: string): Promise<Blob> {
  const res = await fetch(`data:${mime};base64,${data}`);
  return res.blob();
}

function mimeOf(name: string, given?: string): string {
  if (given) return given;
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function parseBundle(text: string): Bundle {
  let b: Bundle;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.");
  }
  if (!b || b.format !== "spotty-akte") throw new Error("Das ist keine Akte-Datei für Spotty (Feld „format“ fehlt).");
  if (b.version !== 1) throw new Error(`Version ${b.version} dieser Datei wird nicht unterstützt.`);
  return b;
}

export function bundleCounts(b: Bundle) {
  return {
    documents: b.documents?.length || 0,
    files: (b.documents || []).reduce((n, d) => n + (d.files || []).filter((f) => f.data).length, 0) + (b.photos || []).filter((p) => p.data).length,
    labs: b.labs?.length || 0,
    events: b.events?.length || 0,
    questions: b.questions?.length || 0,
    entries: b.entries?.length || 0,
    checks: b.checks?.length || 0,
    photos: b.photos?.length || 0,
    regimens: b.regimens?.length || 0,
  };
}

async function upsertChunks(table: string, rows: Record<string, unknown>[], progress: Progress, label: string) {
  for (let i = 0; i < rows.length; i += 200) {
    progress(label, i, rows.length);
    await backend.upsert(table, rows.slice(i, i + 200));
  }
}

/**
 * Überträgt den Inhalt der Datei in die Datenbank.
 * overwrite = false: vorhandene Datensätze (gleiche Kennung) bleiben unverändert, nur Neues kommt hinzu.
 */
export async function importBundle(b: Bundle, overwrite: boolean, progress: Progress): Promise<ImportSummary> {
  const sum: ImportSummary = { profile: false, regimens: 0, documents: 0, files: 0, labs: 0, events: 0, questions: 0, entries: 0, checks: 0, photos: 0, skipped: 0, warnings: [] };
  const has = (table: TableName, key: Record<string, unknown>) => !!store.find(table, key);
  const keep = <T,>(table: TableName, key: Record<string, unknown>, row: T): T | null => {
    if (!overwrite && has(table, key)) {
      sum.skipped++;
      return null;
    }
    return row;
  };

  // Stammdaten
  if (b.profile) {
    const existing = store.find<{ data: ProfileData }>("profile", { id: 1 });
    if (overwrite || !existing) {
      progress("Stammdaten", 0, 1);
      await backend.upsert("profile", { id: 1, data: b.profile });
      sum.profile = true;
    } else sum.skipped++;
  }

  // Behandlungsplan
  const regs = (b.regimens || []).map((r) => keep("regimens", { id: r.id }, r)).filter(Boolean) as Regimen[];
  if (regs.length) await upsertChunks("regimens", regs as unknown as Record<string, unknown>[], progress, "Behandlungsplan");
  sum.regimens = regs.length;

  // Dokumente mit Dateien
  const docs = b.documents || [];
  const docIds = new Set(docs.map((d) => d.id));
  let fileTotal = 0;
  for (const d of docs) fileTotal += (d.files || []).filter((f) => f.data).length;
  let fileDone = 0;
  for (const d of docs) {
    if (!d.id || !d.title) {
      sum.warnings.push("Ein Dokument ohne Kennung oder Titel wurde übersprungen.");
      continue;
    }
    if (!overwrite && has("documents", { id: d.id })) {
      sum.skipped++;
      continue;
    }
    const files: DocFile[] = [];
    for (const f of d.files || []) {
      if (!f.data) continue;
      const mime = mimeOf(f.name, f.mime);
      const path = `${d.id}/${safeName(f.name)}`;
      progress(`Datei ${f.name}`, fileDone, fileTotal);
      const blob = await blobOf(f.data, mime);
      await backend.upload("documents", path, blob, mime);
      files.push({ path, name: f.name, mime, bytes: blob.size });
      fileDone++;
      sum.files++;
    }
    const row: Doc = {
      id: d.id,
      title: d.title,
      doc_date: isValidDay(d.doc_date) ? d.doc_date : null,
      issuer: d.issuer || null,
      kind: d.kind || "befund",
      summary: d.summary || null,
      findings: Array.isArray(d.findings) ? d.findings : [],
      files,
      status: d.status === "original_fehlt" || d.status === "ausstehend" ? d.status : "ok",
      source: "import",
    };
    progress("Dokumente", sum.documents, docs.length);
    await backend.upsert("documents", row as unknown as Record<string, unknown>);
    sum.documents++;
  }

  // Laborwerte
  const labs: Lab[] = [];
  for (const l of b.labs || []) {
    if (!isValidDay(l.date) || !l.param) continue;
    const docId = l.document_id && (docIds.has(l.document_id) || has("documents", { id: l.document_id })) ? l.document_id : null;
    const id = await stableId(`lab|${l.document_id || ""}|${l.date}|${l.code || ""}|${l.param}|${l.unit || ""}`);
    const row: Lab = {
      id,
      document_id: docId,
      date: l.date,
      grp: l.grp || null,
      param: l.param,
      code: l.code || null,
      value: typeof l.value === "number" ? l.value : null,
      value_text: l.value_text || null,
      unit: l.unit || null,
      ref_low: typeof l.ref_low === "number" ? l.ref_low : null,
      ref_high: typeof l.ref_high === "number" ? l.ref_high : null,
      flag: l.flag === "H" || l.flag === "L" ? l.flag : null,
      device: l.device || null,
      note: l.note || null,
    };
    const k = keep("labs", { id }, row);
    if (k) labs.push(k);
  }
  await upsertChunks("labs", labs as unknown as Record<string, unknown>[], progress, "Laborwerte");
  sum.labs = labs.length;

  // Chronik
  const events: TimelineEvent[] = [];
  for (const e of b.events || []) {
    if (!isValidDay(e.date) || !e.title) continue;
    const id = await stableId(`event|${e.date}|${e.time || ""}|${e.title}`);
    const row: TimelineEvent = {
      id,
      date: e.date,
      time: isValidHm(e.time) ? e.time : null,
      title: e.title,
      text: e.text || null,
      category: e.category || "verlauf",
      document_id: e.document_id && (docIds.has(e.document_id) || has("documents", { id: e.document_id })) ? e.document_id : null,
    };
    const k = keep("events", { id }, row);
    if (k) events.push(k);
  }
  await upsertChunks("events", events as unknown as Record<string, unknown>[], progress, "Chronik");
  sum.events = events.length;

  // Fragen an die Klinik
  const questions: Question[] = [];
  let qi = 0;
  for (const q of b.questions || []) {
    if (!q.text) continue;
    const id = await stableId(`question|${q.text}`);
    const row: Question = { id, text: q.text, sort: typeof q.sort === "number" ? q.sort : ++qi, status: q.status === "geklaert" ? "geklaert" : "offen", answer: q.answer || null };
    const k = keep("questions", { id }, row);
    if (k) questions.push(k);
  }
  await upsertChunks("questions", questions as unknown as Record<string, unknown>[], progress, "Fragen");
  sum.questions = questions.length;

  // Protokolleinträge (als gesehen markiert, damit alte Warnungen nicht erneut erscheinen)
  const entries: Entry[] = [];
  const seen = new Map<string, number>();
  for (const e of b.entries || []) {
    if (!isValidDay(e.day) || !isValidHm(e.time) || !(e.type in TYPES)) {
      sum.warnings.push(`Eintrag ${e.day} ${e.time} (${e.type}) übersprungen: ungültig.`);
      continue;
    }
    const base = `${e.day}|${e.time}|${e.type}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const id = await stableId(`entry|${base}|${n}`);
    const row: Entry = { id, day: e.day, time: e.time, type: e.type as EntryType, data: e.data || {}, slot: e.slot || null, ack: true, source: "import" };
    const k = keep("entries", { id }, row);
    if (k) entries.push(k);
  }
  await upsertChunks("entries", entries as unknown as Record<string, unknown>[], progress, "Protokolleinträge");
  sum.entries = entries.length;

  // Abgehakte Planpunkte; was in der App schon abgehakt ist, bleibt ohne „überschreiben“ stehen.
  const checks: Check[] = [];
  const slots = new Set([...(b.regimens || []), ...store.rows<Regimen>("regimens")].flatMap((r) => (r.slots || []).map((sl) => sl.key)));
  for (const c of b.checks || []) {
    if (!isValidDay(c.day) || !isValidHm(c.time) || !c.slot || !slots.has(c.slot)) {
      sum.warnings.push(`Abgehakter Punkt ${c.day} ${c.time} (${c.slot}) übersprungen: ungültig oder nicht im Plan.`);
      continue;
    }
    const row: Check = { day: c.day, slot: c.slot, time: c.time, note: c.note || null, created_by: store.userId || null, created_at: new Date().toISOString() };
    const k = keep("checks", { day: c.day, slot: c.slot }, row);
    if (k) checks.push(k);
  }
  await upsertChunks("checks", checks as unknown as Record<string, unknown>[], progress, "Abgehakte Planpunkte");
  sum.checks = checks.length;

  // Protokollfotos
  const photos = b.photos || [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!isValidDay(p.day) || !p.data) continue;
    const id = await stableId(`photo|${p.day}|${p.file}`);
    if (!overwrite && has("photos", { id })) {
      sum.skipped++;
      continue;
    }
    const mime = mimeOf(p.file, p.mime);
    const path = `${p.day}/${id}.${mime === "image/png" ? "png" : "jpg"}`;
    progress(`Foto ${p.file}`, i, photos.length);
    const blob = await blobOf(p.data, mime);
    await backend.upload("photos", path, blob, mime);
    const row: Photo = { id, day: p.day, time: isValidHm(p.time) ? p.time : "12:00", path, bytes: blob.size, note: p.note || null };
    await backend.upsert("photos", row as unknown as Record<string, unknown>);
    sum.photos++;
  }

  progress("Abgleich", 1, 1);
  await store.reload();
  return sum;
}

/** Alle Tabellen als JSON (ohne Dateien) – zur Sicherung auf dem eigenen Gerät. */
export function backupJson(): string {
  const tables: TableName[] = ["profile", "regimens", "checks", "entries", "days", "photos", "documents", "labs", "events", "questions", "members"];
  const out: Record<string, unknown> = { format: "spotty-backup", version: 1, created: new Date().toISOString() };
  for (const t of tables) out[t] = store.rows(t);
  return JSON.stringify(out, null, 1);
}
