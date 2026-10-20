// Gespräche mit Claude: Verlauf je Person (Tabelle assistant_messages) und Streaming-Antworten.

import { backend } from "./config";
import { newId } from "./store";

export interface ChatMessage {
  id: string;
  thread: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

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

/** Schickt den Gesprächsverlauf an die Edge Function und liefert den Antworttext stückweise. */
export function askClaude(messages: { role: "user" | "assistant"; content: string }[], onText: (full: string) => void, signal?: AbortSignal): Promise<string> {
  return backend.stream("assistant", { messages: messages.slice(-24) }, onText, signal);
}
