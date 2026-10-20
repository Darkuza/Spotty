// Liest hochgeladene Dateien mit Claude aus:
//  kind "protokoll": Foto eines handschriftlichen Tagesprotokolls → Vorschläge für Einträge
//  kind "dokument":  Befund, Bericht, Laborausdruck (PDF oder Foto) → strukturierte Akte

import { base64FromBytes, errorMessage, json, options } from "../_shared/http.ts";
import { requireMember } from "../_shared/supa.ts";
import { structured } from "../_shared/anthropic.ts";
import { DOCUMENT_SCHEMA, DOCUMENT_SYSTEM, PROTOCOL_SCHEMA, PROTOCOL_SYSTEM, fieldsToData } from "../_shared/extractSchemas.ts";

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
      const raw = await structured<{ eintraege?: Array<Record<string, unknown>> } & Record<string, unknown>>({
        system: PROTOCOL_SYSTEM,
        content,
        toolName: "eintraege_speichern",
        toolDescription: "Speichert die aus dem Protokollfoto gelesenen Einträge.",
        schema: PROTOCOL_SCHEMA,
        maxTokens: 12000,
      });
      // Paare (felder) in das Datenobjekt umwandeln, das die App erwartet.
      const eintraege = (Array.isArray(raw?.eintraege) ? raw.eintraege : []).map((e) => {
        const { felder, data, ...rest } = e;
        return { ...rest, data: data && typeof data === "object" && !Array.isArray(data) ? data : fieldsToData(felder) };
      });
      return json({ ok: true, result: { ...raw, eintraege } });
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
