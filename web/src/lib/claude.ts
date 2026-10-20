// Gespräche mit Claude: Verlauf je Person (Tabelle assistant_messages) und Streaming-Antworten.

import { backend } from "./config";
import { newId } from "./store";

export interface ChatImage {
  media_type: "image/jpeg" | "image/png" | "image/webp";
  /** Base64 ohne Präfix */
  data: string;
  /** Lokale Vorschau-Adresse (nur in dieser Sitzung) */
  url: string;
}

export interface ChatMessage {
  id: string;
  thread: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  /** Foto zur Frage; wird nicht gespeichert, nur in der laufenden Unterhaltung mitgeschickt. */
  image?: ChatImage | null;
}

/** Hinweis im gespeicherten Text, dass ein Foto dabei war. */
export const PHOTO_MARK = "[Foto angehängt]";

export interface Thread {
  id: string;
  title: string;
  updated: string;
  messages: ChatMessage[];
}

const TABLE = "assistant_messages";

export async function loadThreads(): Promise<Thread[]> {
  const rows = (await backend.selectAll(TABLE)) as unknown as ChatMessage[];
  const map = new Map<string, ChatMessage[]>();
  for (const r of rows) {
    if (!map.has(r.thread)) map.set(r.thread, []);
    map.get(r.thread)!.push(r);
  }
  const threads: Thread[] = [];
  for (const [id, msgs] of map) {
    msgs.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = msgs.find((m) => m.role === "user");
    threads.push({ id, title: (first?.content || "Gespräch").replace(/\s+/g, " ").slice(0, 90), updated: msgs[msgs.length - 1].created_at, messages: msgs });
  }
  return threads.sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function saveMessage(thread: string, role: "user" | "assistant", content: string): Promise<ChatMessage> {
  const m: ChatMessage = { id: newId(), thread, role, content, created_at: new Date().toISOString() };
  await backend.upsert(TABLE, m as unknown as Record<string, unknown>);
  return m;
}

export async function deleteThread(t: Thread): Promise<void> {
  await Promise.all(t.messages.map((m) => backend.remove(TABLE, { id: m.id })));
}

type OutMessage = { role: "user" | "assistant"; content: string; image?: { media_type: string; data: string } };

/** Schickt den Gesprächsverlauf an die Edge Function und liefert den Antworttext stückweise. Höchstens die zwei jüngsten Fotos gehen mit. */
export function askClaude(messages: { role: "user" | "assistant"; content: string; image?: ChatImage | null }[], onText: (full: string) => void, signal?: AbortSignal): Promise<string> {
  const recent = messages.slice(-24);
  let images = 0;
  const out: OutMessage[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const o: OutMessage = { role: m.role, content: m.content };
    if (m.image && images < 2) {
      o.image = { media_type: m.image.media_type, data: m.image.data };
      images++;
    }
    out.unshift(o);
  }
  return backend.stream("assistant", { messages: out }, onText, signal);
}

/** Liest eine Bilddatei als Base64 (ohne „data:…;base64,“). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(r.error || new Error("Datei konnte nicht gelesen werden."));
    r.readAsDataURL(blob);
  });
}
