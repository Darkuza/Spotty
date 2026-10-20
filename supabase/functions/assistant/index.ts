// Claude-Assistent: beantwortet Fragen mit der vollständigen Akte als Wissensstand (Streaming).

import { corsHeaders, errorMessage, json, options } from "../_shared/http.ts";
import { requireMember } from "../_shared/supa.ts";
import { loadContextData } from "../_shared/context.ts";
import { buildContext, SYSTEM_RULES } from "../_shared/contextText.ts";
import { berlinNow } from "../_shared/dates.ts";
import { CHAT_EFFORT, CHAT_MODEL, textStream, USE_THINKING } from "../_shared/anthropic.ts";

interface InMessage {
  role: "user" | "assistant";
  content: string;
}

function cleanMessages(raw: unknown): InMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: InMessage[] = [];
  for (const m of raw.slice(-24)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content: content.slice(0, 12000) });
    }
  }
  // Die Unterhaltung muss mit einer Nutzerfrage beginnen und enden.
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  const auth = await requireMember(req);
  if (auth instanceof Response) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const messages = cleanMessages(body.messages);
    if (!messages.length) return json({ error: "Keine Frage übergeben." }, 400);

    const data = await loadContextData(auth.client);
    const now = berlinNow();
    const ctx = buildContext(data, now.day, now.hm);
    const asker = `Es fragt: ${auth.member.name}.`;

    const request: Record<string, unknown> = {
      model: CHAT_MODEL,
      max_tokens: 12000,
      system: [
        { type: "text", text: SYSTEM_RULES },
        { type: "text", text: ctx.static, cache_control: { type: "ephemeral" } },
        { type: "text", text: `${ctx.dynamic}\n\n${asker}` },
      ],
      messages,
    };
    if (USE_THINKING) {
      request.thinking = { type: "adaptive" };
      request.output_config = { effort: CHAT_EFFORT };
    }
    const stream = textStream(request);
    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
