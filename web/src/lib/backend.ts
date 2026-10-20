// Zugriff auf Supabase (Anmeldung, Tabellen, Echtzeit, Dateien, Functions).
// Für lokale Tests gibt es einen Demo-Speicher mit derselben Schnittstelle.

import { createClient, type Session as SbSession, type SupabaseClient } from "@supabase/supabase-js";

export const TABLES = ["profile", "regimens", "checks", "entries", "days", "photos", "documents", "labs", "events", "questions", "members"] as const;
export type TableName = (typeof TABLES)[number];
export type Row = Record<string, unknown>;

export const PK: Record<TableName, string[]> = {
  profile: ["id"],
  regimens: ["id"],
  checks: ["day", "slot"],
  entries: ["id"],
  days: ["day"],
  photos: ["id"],
  documents: ["id"],
  labs: ["id"],
  events: ["id"],
  questions: ["id"],
  members: ["user_id"],
};

export type Bucket = "photos" | "documents";

export interface Session {
  userId: string;
  email: string;
  accessToken: string;
}

export class BackendError extends Error {
  code: string;
  transient: boolean;
  constructor(message: string, code = "", transient = false) {
    super(message);
    this.code = code;
    this.transient = transient;
  }
}

export interface Backend {
  kind: "supabase" | "demo";
  getSession(): Promise<Session | null>;
  onAuth(cb: (s: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  changePassword(password: string): Promise<void>;
  selectAll(table: string, filter?: Record<string, unknown>): Promise<Row[]>;
  upsert(table: string, row: Row | Row[]): Promise<void>;
  remove(table: string, key: Row): Promise<void>;
  subscribe(onChange: (table: TableName, kind: "upsert" | "delete", row: Row) => void, onStatus: (status: string) => void): () => void;
  upload(bucket: Bucket, path: string, blob: Blob, contentType: string): Promise<void>;
  signedUrl(bucket: Bucket, path: string): Promise<string>;
  removeFiles(bucket: Bucket, paths: string[]): Promise<void>;
  invoke<T = unknown>(fn: string, body: unknown): Promise<T>;
  stream(fn: string, body: unknown, onText: (full: string) => void, signal?: AbortSignal): Promise<string>;
}

function isTransient(err: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!err) return false;
  const m = (err.message || "").toLowerCase();
  if (m.includes("fetch") || m.includes("network") || m.includes("timeout") || m.includes("load failed")) return true;
  if (typeof err.status === "number" && (err.status === 0 || err.status >= 500)) return true;
  return false;
}

function toError(err: { message?: string; code?: string; status?: number; details?: string }): BackendError {
  return new BackendError(err.message || "Unbekannter Fehler", err.code || "", isTransient(err));
}

function authMessage(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-Mail oder Passwort stimmt nicht.";
  if (/email not confirmed/i.test(msg)) return "Das Konto ist noch nicht bestätigt.";
  if (/rate limit/i.test(msg)) return "Zu viele Versuche. Bitte kurz warten.";
  if (/password should be/i.test(msg)) return "Das Passwort ist zu kurz (mindestens 8 Zeichen).";
  return msg;
}

function toSession(s: SbSession | null): Session | null {
  if (!s || !s.user) return null;
  return { userId: s.user.id, email: s.user.email || "", accessToken: s.access_token };
}

export class SupabaseBackend implements Backend {
  kind = "supabase" as const;
  readonly sb: SupabaseClient;
  private url: string;
  private key: string;

  constructor(url: string, key: string) {
    this.url = url.replace(/\/$/, "");
    this.key = key;
    this.sb = createClient(this.url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "spotty-auth", detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    return toSession(data.session);
  }

  onAuth(cb: (s: Session | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, s) => cb(toSession(s)));
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new BackendError(authMessage(error.message), "auth");
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async changePassword(password: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new BackendError(authMessage(error.message), "auth");
  }

  async selectAll(table: string, filter?: Record<string, unknown>): Promise<Row[]> {
    const out: Row[] = [];
    const size = 1000;
    for (let from = 0; from < 50000; from += size) {
      let q = this.sb.from(table).select("*").range(from, from + size - 1);
      if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v as string);
      const { data, error } = await q;
      if (error) throw toError(error);
      out.push(...((data as Row[]) || []));
      if (!data || data.length < size) break;
    }
    return out;
  }

  async upsert(table: string, row: Row | Row[]): Promise<void> {
    const { error } = await this.sb.from(table).upsert(row as Row);
    if (error) throw toError(error);
  }

  async remove(table: string, key: Row): Promise<void> {
    const { error } = await this.sb.from(table).delete().match(key);
    if (error) throw toError(error);
  }

  subscribe(onChange: (table: TableName, kind: "upsert" | "delete", row: Row) => void, onStatus: (status: string) => void): () => void {
    const channel = this.sb.channel("spotty-db");
    for (const t of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload) => {
        if (payload.eventType === "DELETE") onChange(t, "delete", payload.old as Row);
        else onChange(t, "upsert", payload.new as Row);
      });
    }
    channel.subscribe((status) => onStatus(String(status)));
    return () => {
      void this.sb.removeChannel(channel);
    };
  }

  async upload(bucket: Bucket, path: string, blob: Blob, contentType: string): Promise<void> {
    const { error } = await this.sb.storage.from(bucket).upload(path, blob, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) throw new BackendError(error.message, "storage", isTransient(error));
  }

  async signedUrl(bucket: Bucket, path: string): Promise<string> {
    const { data, error } = await this.sb.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data) throw new BackendError(error?.message || "Datei nicht gefunden", "storage");
    return data.signedUrl;
  }

  async removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await this.sb.storage.from(bucket).remove(paths);
    if (error) throw new BackendError(error.message, "storage");
  }

  async invoke<T = unknown>(fn: string, body: unknown): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(fn, { body: body as Record<string, unknown> });
    if (error) {
      let msg = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const j = await ctx.json();
          if (j && j.error) msg = j.error;
        }
      } catch {
        /* Antwort ohne JSON */
      }
      throw new BackendError(msg, "function", /fetch|network/i.test(msg));
    }
    return data as T;
  }

  async stream(fn: string, body: unknown, onText: (full: string) => void, signal?: AbortSignal): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new BackendError("Nicht angemeldet.", "auth");
    const res = await fetch(`${this.url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: this.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      let msg = `Fehler ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* keine JSON-Antwort */
      }
      throw new BackendError(msg, "function", res.status >= 500);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      full += value;
      onText(full);
    }
    return full;
  }
}

// ---------------------------------------------------------------------------
// Demo-Speicher (nur für Entwicklung und Tests; Daten bleiben im Browser)
// ---------------------------------------------------------------------------

type Listener = (table: TableName, kind: "upsert" | "delete", row: Row) => void;

export class DemoBackend implements Backend {
  kind = "demo" as const;
  private data: Record<string, Row[]> = {};
  private files = new Map<string, string>();
  private listeners = new Set<Listener>();
  private session: Session = { userId: "demo-user", email: "demo@spotty.local", accessToken: "demo" };

  constructor() {
    try {
      const raw = localStorage.getItem("spotty-demo-db");
      if (raw) this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
    if (!this.data.members || !this.data.members.length) {
      this.data.members = [{ user_id: "demo-user", email: "demo@spotty.local", name: "Demo", role: "admin" }];
    }
  }

  private save() {
    try {
      localStorage.setItem("spotty-demo-db", JSON.stringify(this.data));
    } catch {
      /* Speicher voll oder gesperrt */
    }
  }

  private keyOf(table: string, row: Row): string {
    const pk = (PK as Record<string, string[]>)[table] || ["id"];
    return pk.map((k) => String(row[k])).join("|");
  }

  async getSession() {
    return this.session;
  }
  onAuth(cb: (s: Session | null) => void) {
    setTimeout(() => cb(this.session), 0);
    return () => {};
  }
  async signIn() {}
  async signOut() {}
  async changePassword() {}

  async selectAll(table: string, filter?: Record<string, unknown>): Promise<Row[]> {
    const rows = this.data[table] || [];
    if (!filter) return rows.map((r) => ({ ...r }));
    return rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).map((r) => ({ ...r }));
  }

  async upsert(table: string, row: Row | Row[]): Promise<void> {
    const list = Array.isArray(row) ? row : [row];
    const rows = (this.data[table] = this.data[table] || []);
    for (const r of list) {
      const k = this.keyOf(table, r);
      const i = rows.findIndex((x) => this.keyOf(table, x) === k);
      const full: Row = { created_by: this.session.userId, created_at: new Date().toISOString(), ...(i >= 0 ? rows[i] : {}), ...r };
      if (i >= 0) rows[i] = full;
      else rows.push(full);
      if ((TABLES as readonly string[]).includes(table)) for (const l of this.listeners) l(table as TableName, "upsert", { ...full });
    }
    this.save();
  }

  async remove(table: string, key: Row): Promise<void> {
    const rows = this.data[table] || [];
    const k = this.keyOf(table, key);
    this.data[table] = rows.filter((x) => this.keyOf(table, x) !== k);
    this.save();
    if ((TABLES as readonly string[]).includes(table)) for (const l of this.listeners) l(table as TableName, "delete", key);
  }

  subscribe(onChange: Listener, onStatus: (s: string) => void) {
    this.listeners.add(onChange);
    setTimeout(() => onStatus("SUBSCRIBED"), 0);
    return () => this.listeners.delete(onChange);
  }

  async upload(bucket: Bucket, path: string, blob: Blob): Promise<void> {
    const url = URL.createObjectURL(blob);
    this.files.set(`${bucket}/${path}`, url);
  }

  async signedUrl(bucket: Bucket, path: string): Promise<string> {
    const u = this.files.get(`${bucket}/${path}`);
    if (!u) throw new BackendError("Datei nur in der Demo-Sitzung vorhanden", "storage");
    return u;
  }

  async removeFiles(bucket: Bucket, paths: string[]) {
    for (const p of paths) this.files.delete(`${bucket}/${p}`);
  }

  async invoke<T = unknown>(fn: string, body: unknown): Promise<T> {
    if (fn === "admin-users") return { ok: true, members: this.data.members } as T;
    if (fn === "extract") {
      const b = body as { kind?: string };
      if (b.kind === "dokument") {
        return { ok: true, result: { title: "Demo-Befund", doc_date: null, issuer: null, kind: "befund", summary: "Im Demo-Modus liest Claude keine Dateien aus.", findings: [], labs: [], events: [], fragen: [] } } as T;
      }
      return { ok: true, result: { datum: null, eintraege: [], medikamente: [], hinweise: "Im Demo-Modus liest Claude keine Fotos aus." } } as T;
    }
    if (fn === "push-key") throw new BackendError("Push ist im Demo-Modus nicht verfügbar.", "function");
    throw new BackendError(`Funktion ${fn} ist im Demo-Modus nicht verfügbar.`, "function");
  }

  async stream(_fn: string, _body: unknown, onText: (full: string) => void): Promise<string> {
    const text = "Im Demo-Modus ist Claude nicht verbunden. Nach der Einrichtung mit Supabase und dem API-Schlüssel beantworte ich hier Fragen mit der vollständigen Akte.";
    let full = "";
    for (const word of text.split(" ")) {
      full += (full ? " " : "") + word;
      onText(full);
      await new Promise((r) => setTimeout(r, 18));
    }
    return full;
  }
}
