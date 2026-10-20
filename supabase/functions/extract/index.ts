// Liest hochgeladene Dateien mit Claude aus:
//  kind "protokoll": Foto eines handschriftlichen Tagesprotokolls → Vorschläge für Einträge
//  kind "dokument":  Befund, Bericht, Laborausdruck (PDF oder Foto) → strukturierte Akte

import { base64FromBytes, errorMessage, json, options } from "../_shared/http.ts";
import { requireMember } from "../_shared/supa.ts";
import { structured } from "../_shared/anthropic.ts";

const ENTRY_TYPES = ["atem", "spo2", "gewicht", "trinken", "futter", "kot", "urin", "gassi", "erbrechen", "husten", "med", "notiz"];

const LAB_CODES =
  "HCT Hämatokrit, HGB Hämoglobin, RBC Erythrozyten, MCV, MCH, MCHC, RDW, RETIC Retikulozyten (Anzahl), RETICP (%), RETHGB Retikulozytenhämoglobin, WBC Leukozyten, NEU/NEUP Neutrophile, LYM/LYMP Lymphozyten, MONO/MONOP Monozyten, EOS/EOSP Eosinophile, BASO/BASOP Basophile, PLT Thrombozyten, MPV, PDW, PCT Thrombokrit, UREA Harnstoff, CREA Kreatinin, PHOS Phosphat, NA Natrium, K Kalium, NAK Na/K, CL Chlorid, CA Calcium, TBIL Bilirubin, ALT, ALKP alkalische Phosphatase, GLU Glukose, TP Gesamteiweiß, ALB Albumin, GLOB Globulin, ALBGLOB Alb/Glob, T4, TSH, SDMA, CHOL Cholesterin, CRP, LIPASE, B12 Cobalamin, FOLAT";

const PROTOCOL_SYSTEM = `Du liest das Foto eines handschriftlichen Tagesprotokolls über einen kranken Hund und überträgst jede Zeile in strukturierte Einträge.
Regeln:
- Übertrage nur, was auf dem Blatt steht. Nichts ergänzen, nichts schätzen. Unleserliches als "unsicher": true markieren und in "hinweise" nennen.
- Uhrzeit "HH:MM"; bei Zeitspannen (10:30–11:15) den Beginn nehmen und die Spanne in data.text vermerken.
- Eine Zeile kann mehrere Einträge ergeben (z. B. Wasser und Tablette).
- Typen und Felder:
  trinken: {"ml": Zahl, "art": "Wasser"|"Hühnerbrühe"|"Leberwurstwasser"|"Milch-Wasser"|"Sonstiges", "weg": "spritze"|"selbst"}  (Spritze/Oralspritze/Kanüle = spritze; aus Schale/Napf selbst = selbst)
  futter: {"g": Zahl (nur wenn Gramm angegeben), "menge": Text wie "2 TL" oder "1 Handvoll" (wenn keine Gramm), "art": "Nassfutter"|"Huhn"|"Frischkäse"|"Leberwurst"|"Kartoffel"|"Trockenfutter"|"Sonstiges", "reaktion": "unauffällig"|"Schmerzreaktion"|"Übelkeit"|"abgelehnt"}
  kot: {"form": "fest"|"geformt, weich"|"breiig"|"flüssig", "farbe": "braun"|"hell / orange"|"dunkelbraun"|"schwarz, klebrig", "auff": ["Schleim","frisches Blut"], "menge": "klein"|"mittel"|"groß"}
  urin: {"menge": "wenig"|"normal"|"viel"}
  gassi: {"min": Dauer in Minuten, "energie": "gut"|"mittel"|"niedrig"}
  erbrechen: {"inhalt": Text, "blut": "nein"|"ja"}
  husten: {"anzahl": Zahl, "art": Text}
  atem: {"bpm": Atemzüge pro Minute, "zustand": "schlaeft"|"ruhig"|"aktiv", "o2": "ja"|"nein"}
  spo2: {"pct": Zahl, "puls": Zahl}
  gewicht: {"kg": Zahl}
  notiz: {"tags": [], "text": Beobachtung}
  Zu jedem Eintrag darf data.text eine kurze Ergänzung enthalten.
- Medikamente (Tabletten, Pulver, Säfte, Sprays, Inhalation) NICHT als Eintrag, sondern in "medikamente" mit Uhrzeit, Name und Menge – die App gleicht sie mit dem Behandlungsplan ab.
- Abkürzungen: TL = Teelöffel, Tbl. = Tablette, ml = Milliliter, „Schmerz“ = Schmerzmittel, „Übelkeit“ = Mittel gegen Übelkeit. Eigene Begriffe der Familie stehen in den Pflegehinweisen, die mit dem Foto mitgeschickt werden.`;

const DOCUMENT_SYSTEM = `Du wertest ein tierärztliches Dokument über einen Hund aus (Befund, Bericht, Laborausdruck, Rechnung, Plan) und legst es strukturiert in der Akte ab.
Regeln:
- Übernimm nur, was im Dokument steht; nichts erfinden, Werte exakt übernehmen (Komma als Dezimaltrennzeichen in Zahlen umwandeln: 50,6 → 50.6).
- summary: 5 bis 10 Sätze Klartext auf Deutsch: Anlass, wichtigste Befunde, Beurteilung, Empfehlungen und vereinbartes Vorgehen.
- findings: die zentralen Einzelbefunde mit kurzer Überschrift; level "crit" für schwerwiegende, "warn" für abklärungsbedürftige, sonst "info".
- labs: jeder Laborwert mit Parametername, Code (falls passend aus dieser Liste: ${LAB_CODES}; sonst null), Zahlenwert oder value_text (z. B. "<20"), Einheit, Referenzbereich und flag "H"/"L" nur wenn außerhalb der Referenz.
- events: datierte Ereignisse aus dem Dokument (Vorstellung, Untersuchung, Behandlung), category "klinik"|"diagnostik"|"therapie"|"symptom"|"verlauf".
- fragen: offene Punkte, die die Familie mit der Klinik klären sollte (höchstens 5), nur wenn sie sich aus dem Dokument ergeben.`;

const PROTOCOL_SCHEMA = {
  type: "object",
  properties: {
    datum: { type: ["string", "null"], description: "Datum des Protokolls (JJJJ-MM-TT), falls lesbar" },
    eintraege: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string", description: "HH:MM" },
          type: { type: "string", enum: ENTRY_TYPES },
          data: { type: "object" },
          original: { type: "string", description: "Zeile wie auf dem Blatt" },
          unsicher: { type: "boolean" },
        },
        required: ["time", "type", "data", "original", "unsicher"],
      },
    },
    medikamente: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string" },
          name: { type: "string" },
          menge: { type: "string" },
          original: { type: "string" },
        },
        required: ["time", "name", "original"],
      },
    },
    hinweise: { type: "string" },
  },
  required: ["eintraege", "medikamente", "hinweise"],
};

const DOCUMENT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    doc_date: { type: ["string", "null"], description: "JJJJ-MM-TT" },
    issuer: { type: ["string", "null"], description: "Einrichtung und Person" },
    kind: { type: "string", enum: ["befund", "labor", "bildgebung", "bericht", "rechnung", "plan", "test", "sonstiges"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, text: { type: "string" }, level: { type: "string", enum: ["info", "warn", "crit"] } },
        required: ["label", "text", "level"],
      },
    },
    labs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          grp: { type: ["string", "null"] },
          param: { type: "string" },
          code: { type: ["string", "null"] },
          value: { type: ["number", "null"] },
          value_text: { type: ["string", "null"] },
          unit: { type: ["string", "null"] },
          ref_low: { type: ["number", "null"] },
          ref_high: { type: ["number", "null"] },
          flag: { type: ["string", "null"], enum: ["H", "L", null] },
        },
        required: ["param", "value", "unit"],
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: { date: { type: "string" }, time: { type: ["string", "null"] }, title: { type: "string" }, text: { type: ["string", "null"] }, category: { type: "string" } },
        required: ["date", "title", "category"],
      },
    },
    fragen: { type: "array", items: { type: "string" } },
  },
  required: ["title", "doc_date", "issuer", "kind", "summary", "findings", "labs", "events", "fragen"],
};

function mimeOf(path: string, fallback?: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".pdf")) return "application/pdf";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  const auth = await requireMember(req);
  if (auth instanceof Response) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "dokument" ? "dokument" : "protokoll";
    const bucket = body.bucket === "documents" ? "documents" : "photos";
    const paths: string[] = Array.isArray(body.paths) ? body.paths.slice(0, 8) : body.path ? [body.path] : [];
    if (!paths.length) return json({ error: "Keine Datei angegeben." }, 400);

    const content: unknown[] = [];
    for (const path of paths) {
      const { data, error } = await auth.client.storage.from(bucket).download(path);
      if (error || !data) return json({ error: `Datei nicht lesbar: ${path}` }, 404);
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.length > 25 * 1024 * 1024) return json({ error: "Datei zu groß (über 25 MB)." }, 413);
      const mime = mimeOf(path, data.type);
      const b64 = base64FromBytes(bytes);
      if (mime === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: mime, data: b64 } });
      else if (mime.startsWith("image/")) content.push({ type: "image", source: { type: "base64", media_type: mime, data: b64 } });
      else return json({ error: `Dateityp wird nicht unterstützt: ${mime}` }, 415);
    }

    if (kind === "protokoll") {
      const { data: regs } = await auth.client.from("regimens").select("name,category,active").eq("active", true);
      const { data: prof } = await auth.client.from("profile").select("data").eq("id", 1).maybeSingle();
      const names = (regs || []).filter((r: { category: string }) => r.category === "med" || r.category === "inh").map((r: { name: string }) => r.name);
      const care = ((prof?.data as { care_notes?: string[] } | null)?.care_notes || []).join("; ");
      content.push({
        type: "text",
        text: `Protokolltag laut App: ${body.day || "unbekannt"}. Aktuelle Medikamente im Plan: ${names.join(", ") || "keine"}.${care ? ` Pflegehinweise und Begriffe der Familie: ${care}.` : ""} Bitte alle Zeilen übertragen.`,
      });
      const result = await structured({
        system: PROTOCOL_SYSTEM,
        content,
        toolName: "eintraege_speichern",
        toolDescription: "Speichert die aus dem Protokollfoto gelesenen Einträge.",
        schema: PROTOCOL_SCHEMA,
        maxTokens: 12000,
      });
      return json({ ok: true, result });
    }

    content.push({ type: "text", text: "Bitte das Dokument für die Akte auswerten." });
    const result = await structured({
      system: DOCUMENT_SYSTEM,
      content,
      toolName: "befund_speichern",
      toolDescription: "Legt das ausgewertete Dokument in der Akte ab.",
      schema: DOCUMENT_SCHEMA,
      maxTokens: 12000,
    });
    return json({ ok: true, result });
  } catch (e) {
    const status = (e as { status?: number }).status;
    return json({ error: errorMessage(e) }, status && status >= 400 && status < 600 ? status : 500);
  }
});
