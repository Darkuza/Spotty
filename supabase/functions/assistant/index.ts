// Claude-Assistent: beantwortet Fragen mit der vollständigen Akte als Wissensstand (Streaming).

import { corsHeaders, errorMessage, json, options } from "../_shared/http.ts";
import { requireMember } from "../_shared/supa.ts";
import { loadContextData } from "../_shared/context.ts";
import { buildContext, SYSTEM_RULES } from "../_shared/contextText.ts";
import { berlinNow } from "../_shared/dates.ts";
import { CHAT_EFFORT, CHAT_MODEL, textStream, USE_THINKING } from "../_shared/anthropic.ts";

interface InImage {
  media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
}

interface InMessage {
  role: "user" | "assistant";
  content: string;
  image?: InImage;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_CHARS = 6_500_000; // etwa 4,8 MB Bilddaten (Grenze der API: 5 MB je Bild)
const MAX_IMAGES = 2;

function cleanImage(raw: unknown): InImage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const type = typeof r.media_type === "string" ? r.media_type : "";
  const data = typeof r.data === "string" ? r.data.replace(/\s+/g, "") : "";
  if (!IMAGE_TYPES.has(type) || !data || data.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return undefined;
  return { media_type: type as InImage["media_type"], data };
}

function cleanMessages(raw: unknown): InMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: InMessage[] = [];
  for (const m of raw.slice(-24)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      const msg: InMessage = { role, content: content.slice(0, 12000) };
      if (role === "user") {
        const img = cleanImage((m as Record<string, unknown>).image);
        if (img) msg.image = img;
      }
      out.push(msg);
    }
  }
  // Die Unterhaltung muss mit einer Nutzerfrage beginnen und enden.
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  // Nur die jüngsten Fotos mitschicken.
  let images = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    if (!out[i].image) continue;
    if (++images > MAX_IMAGES) delete out[i].image;
  }
  return out;
}

function toApi(m: InMessage): Record<string, unknown> {
  if (!m.image) return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: [
      { type: "image", source: { type: "base64", media_type: m.image.media_type, data: m.image.data } },
      { type: "text", text: m.content },
    ],
  };
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
      messages: messages.map(toApi),
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
