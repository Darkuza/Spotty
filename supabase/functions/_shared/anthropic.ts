// Zugriff auf die Claude API (Messages API) mit dem Schlüssel aus ANTHROPIC_API_KEY.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const CHAT_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5";
export const EXTRACT_MODEL = Deno.env.get("CLAUDE_EXTRACT_MODEL") || CHAT_MODEL;
export const CHAT_EFFORT = Deno.env.get("CLAUDE_EFFORT") || "medium";
export const USE_THINKING = (Deno.env.get("CLAUDE_THINKING") || "adaptive") !== "off";

export class ClaudeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function headers(): Record<string, string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new ClaudeError(500, "Der Claude-Schlüssel (ANTHROPIC_API_KEY) ist nicht eingerichtet.");
  return { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" };
}

function readError(text: string, status: number): string {
  try {
    const j = JSON.parse(text);
    return j?.error?.message || `Claude API ${status}`;
  } catch {
    return text.slice(0, 300) || `Claude API ${status}`;
  }
}

/** Entfernt Denk-Einstellungen (thinking, effort), falls das Modell sie ablehnt; ein Antwortformat bleibt erhalten. */
function withoutThinking(body: Record<string, unknown>): Record<string, unknown> {
  const b = { ...body };
  delete b.thinking;
  const oc = b.output_config as Record<string, unknown> | undefined;
  if (oc && typeof oc === "object") {
    const rest = { ...oc };
    delete rest.effort;
    if (Object.keys(rest).length) b.output_config = rest;
    else delete b.output_config;
  }
  return b;
}

function looksLikeThinkingError(status: number, msg: string): boolean {
  return status === 400 && /thinking|effort/i.test(msg);
}

export async function createMessage(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let r = await fetch(API_URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  let text = await r.text();
  if (!r.ok && looksLikeThinkingError(r.status, readError(text, r.status))) {
    r = await fetch(API_URL, { method: "POST", headers: headers(), body: JSON.stringify(withoutThinking(body)) });
    text = await r.text();
  }
  if (!r.ok) throw new ClaudeError(r.status, readError(text, r.status));
  return JSON.parse(text);
}

/** Ruft Claude mit Streaming auf und liefert nur den Antworttext als Textstrom. */
export function textStream(body: Record<string, unknown>, onDone?: (text: string, usage: unknown) => void): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let usage: unknown = null;
      try {
        let r = await fetch(API_URL, { method: "POST", headers: headers(), body: JSON.stringify({ ...body, stream: true }) });
        if (!r.ok) {
          const t = await r.text();
          const msg = readError(t, r.status);
          if (looksLikeThinkingError(r.status, msg)) {
            r = await fetch(API_URL, { method: "POST", headers: headers(), body: JSON.stringify({ ...withoutThinking(body), stream: true }) });
          } else {
            controller.enqueue(enc.encode(`⚠︎ Claude ist gerade nicht erreichbar (${msg}).`));
            controller.close();
            return;
          }
        }
        if (!r.ok || !r.body) {
          const t = await r.text();
          controller.enqueue(enc.encode(`⚠︎ Claude ist gerade nicht erreichbar (${readError(t, r.status)}).`));
          controller.close();
          return;
        }
        const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const data = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("");
            if (!data) continue;
            let ev: Record<string, any>;
            try {
              ev = JSON.parse(data);
            } catch {
              continue;
            }
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && typeof ev.delta.text === "string") {
              full += ev.delta.text;
              controller.enqueue(enc.encode(ev.delta.text));
            } else if (ev.type === "message_delta" && ev.usage) {
              usage = ev.usage;
            } else if (ev.type === "error") {
              controller.enqueue(enc.encode(`\n\n⚠︎ Abbruch: ${ev.error?.message || "unbekannter Fehler"}`));
            }
          }
        }
        controller.close();
        onDone?.(full, usage);
      } catch (e) {
        controller.enqueue(enc.encode(`\n\n⚠︎ Verbindung zu Claude unterbrochen (${e instanceof Error ? e.message : String(e)}).`));
        controller.close();
      }
    },
  });
}

/** Liest JSON aus einer Textantwort (auch in einem Codeblock). */
function parseJsonText(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new ClaudeError(502, "Claude hat keine auswertbare Antwort geliefert.");
  }
}

function textOf(res: Record<string, unknown>): string {
  const blocks = (res.content as Array<Record<string, unknown>>) || [];
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

/**
 * Strukturierte Antwort nach JSON-Schema (Structured Outputs über output_config.format).
 * Lehnt die API das Format ab, folgt ein zweiter Versuch über ein Werkzeug ohne erzwungene Auswahl.
 */
export async function structured<T>(opts: {
  model?: string;
  system: string;
  content: unknown[];
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const base = {
    model: opts.model || EXTRACT_MODEL,
    max_tokens: opts.maxTokens || 8000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  };
  try {
    const res = await createMessage({ ...base, output_config: { format: { type: "json_schema", schema: opts.schema } } });
    if (res.stop_reason === "max_tokens") throw new ClaudeError(502, "Die Antwort war zu lang und wurde abgeschnitten. Bitte weniger Seiten auf einmal auslesen.");
    return parseJsonText(textOf(res)) as T;
  } catch (e) {
    if (!(e instanceof ClaudeError) || e.status !== 400 || !/output_config|format|schema/i.test(e.message)) throw e;
  }
  const res = await createMessage({
    ...base,
    system: `${opts.system}\n\nGib das Ergebnis ausschließlich über das Werkzeug „${opts.toolName}“ zurück.`,
    tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: opts.schema }],
    tool_choice: { type: "auto" },
  });
  const blocks = (res.content as Array<Record<string, unknown>>) || [];
  const tool = blocks.find((b) => b.type === "tool_use" && b.name === opts.toolName);
  if (tool) return tool.input as T;
  return parseJsonText(textOf(res)) as T;
}
