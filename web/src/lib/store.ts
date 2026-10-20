// Zentraler Datenspeicher der App: lädt alle Tabellen, hält sie per Echtzeit aktuell
// und schreibt Änderungen sofort sichtbar (optimistisch). Änderungen ohne Netz warten
// in einer Warteschlange auf dem Gerät und werden nachgereicht.

import { useSyncExternalStore } from "react";
import { BackendError, PK, TABLES, type Backend, type Row, type TableName } from "./backend";

interface Op {
  id: string;
  table: TableName;
  kind: "upsert" | "delete";
  row: Row;
  t: number;
  tries: number;
}

export interface StoreStatus {
  phase: "idle" | "loading" | "ready" | "error";
  realtime: string;
  pending: number;
  online: boolean;
  error: string;
  loadedAt: number;
}

type ErrorListener = (message: string) => void;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const newId = uuid;

function pick(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) out[k] = row[k];
  return out;
}

class DataStore {
  private maps: Record<string, Map<string, Row>> = {};
  private cache: Partial<Record<TableName, Row[]>> = {};
  private outbox: Op[] = [];
  private listeners = new Set<() => void>();
  private errorListeners = new Set<ErrorListener>();
  private version = 0;
  private backend: Backend | null = null;
  private unsubscribe: (() => void) | null = null;
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private outboxKey = "";
  private hiddenAt = 0;
  userId = "";
  status: StoreStatus = { phase: "idle", realtime: "", pending: 0, online: typeof navigator === "undefined" ? true : navigator.onLine, error: "", loadedAt: 0 };

  constructor() {
    for (const t of TABLES) this.maps[t] = new Map();
  }

  key(table: TableName, row: Row): string {
    return PK[table].map((k) => String(row[k] ?? "")).join("|");
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getVersion = () => this.version;

  onError(l: ErrorListener): () => void {
    this.errorListeners.add(l);
    return () => this.errorListeners.delete(l);
  }

  private emit() {
    this.version++;
    this.cache = {};
    this.status = { ...this.status, pending: this.outbox.length };
    for (const l of this.listeners) l();
  }

  private fail(message: string) {
    for (const l of this.errorListeners) l(message);
  }

  rows<T = Row>(table: TableName): T[] {
    if (!this.cache[table]) this.cache[table] = [...this.maps[table].values()];
    return this.cache[table] as T[];
  }

  find<T = Row>(table: TableName, keyRow: Row): T | undefined {
    return this.maps[table].get(this.key(table, keyRow)) as T | undefined;
  }

  async start(backend: Backend, userId: string): Promise<void> {
    this.stop();
    this.backend = backend;
    this.userId = userId;
    this.outboxKey = `spotty-outbox-${userId}`;
    try {
      this.outbox = JSON.parse(localStorage.getItem(this.outboxKey) || "[]");
    } catch {
      this.outbox = [];
    }
    this.status = { ...this.status, phase: "loading" };
    this.emit();
    await this.reload();
    this.unsubscribe = backend.subscribe(
      (table, kind, row) => this.applyRemote(table, kind, row),
      (s) => {
        const prev = this.status.realtime;
        this.status = { ...this.status, realtime: s };
        this.emit();
        if (s === "SUBSCRIBED" && prev && prev !== "SUBSCRIBED") void this.reload();
      },
    );
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisibility);
    void this.flush();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    for (const t of TABLES) this.maps[t] = new Map();
    this.outbox = [];
    this.status = { phase: "idle", realtime: "", pending: 0, online: navigator.onLine, error: "", loadedAt: 0 };
    this.emit();
  }

  private onOnline = () => {
    this.status = { ...this.status, online: true };
    this.emit();
    void this.flush();
    void this.reload();
  };

  private onOffline = () => {
    this.status = { ...this.status, online: false };
    this.emit();
  };

  private onVisibility = () => {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      return;
    }
    void this.flush();
    if (this.hiddenAt && Date.now() - this.hiddenAt > 90_000) void this.reload();
  };

  async reload(): Promise<void> {
    const backend = this.backend;
    if (!backend) return;
    try {
      const results = await Promise.all(TABLES.map((t) => backend.selectAll(t)));
      TABLES.forEach((t, i) => {
        const m = new Map<string, Row>();
        for (const r of results[i]) m.set(this.key(t, r), r);
        this.maps[t] = m;
      });
      for (const op of this.outbox) this.applyLocal(op);
      this.status = { ...this.status, phase: "ready", error: "", loadedAt: Date.now() };
      this.emit();
    } catch (e) {
      this.status = { ...this.status, phase: this.status.loadedAt ? "ready" : "error", error: e instanceof Error ? e.message : String(e) };
      this.emit();
    }
  }

  private async reloadTable(table: TableName): Promise<void> {
    if (!this.backend) return;
    try {
      const rows = await this.backend.selectAll(table);
      const m = new Map<string, Row>();
      for (const r of rows) m.set(this.key(table, r), r);
      this.maps[table] = m;
      for (const op of this.outbox) if (op.table === table) this.applyLocal(op);
      this.emit();
    } catch {
      /* nächster Abgleich holt es nach */
    }
  }

  private applyLocal(op: Op) {
    const m = this.maps[op.table];
    const k = this.key(op.table, op.row);
    if (op.kind === "delete") m.delete(k);
    else m.set(k, { ...(m.get(k) || {}), ...op.row });
  }

  private applyRemote(table: TableName, kind: "upsert" | "delete", row: Row) {
    if (!row) return;
    const k = this.key(table, row);
    if (this.outbox.some((op) => op.table === table && this.key(table, op.row) === k)) return;
    if (kind === "delete") this.maps[table].delete(k);
    else this.maps[table].set(k, row);
    this.emit();
  }

  private save() {
    try {
      localStorage.setItem(this.outboxKey, JSON.stringify(this.outbox));
    } catch {
      /* Speicher voll */
    }
  }

  upsert(table: TableName, row: Row): void {
    const op: Op = { id: uuid(), table, kind: "upsert", row, t: Date.now(), tries: 0 };
    this.applyLocal(op);
    // Ältere, noch nicht gesendete Änderungen am selben Datensatz zusammenfassen.
    const k = this.key(table, row);
    this.outbox = this.outbox.filter((o, i) => !(i > 0 && o.table === table && o.kind === "upsert" && this.key(table, o.row) === k));
    const merged = { ...(this.maps[table].get(k) || row) };
    this.outbox.push({ ...op, row: merged });
    this.save();
    this.emit();
    void this.flush();
  }

  /** Fügt neue Felder in einen bestehenden Datensatz ein und speichert den ganzen Datensatz. */
  patch(table: TableName, keyRow: Row, changes: Row): void {
    const current = this.find(table, keyRow) || keyRow;
    this.upsert(table, { ...current, ...changes });
  }

  remove(table: TableName, keyRow: Row): void {
    const row = pick(keyRow, PK[table]);
    const k = this.key(table, row);
    this.outbox = this.outbox.filter((o, i) => !(i > 0 && o.table === table && this.key(table, o.row) === k));
    const op: Op = { id: uuid(), table, kind: "delete", row, t: Date.now(), tries: 0 };
    this.applyLocal(op);
    this.outbox.push(op);
    this.save();
    this.emit();
    void this.flush();
  }

  private scheduleRetry(tries: number) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.min(60_000, 2_000 * Math.pow(2, Math.min(tries, 5)));
    this.retryTimer = setTimeout(() => void this.flush(), delay);
  }

  async flush(): Promise<void> {
    if (!this.backend || this.flushing || !this.outbox.length) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        const op = this.outbox[0];
        try {
          if (op.kind === "delete") await this.backend.remove(op.table, pick(op.row, PK[op.table]));
          else await this.backend.upsert(op.table, op.row);
          this.outbox.shift();
          this.save();
        } catch (e) {
          const transient = e instanceof BackendError ? e.transient : true;
          if (transient) {
            op.tries++;
            this.save();
            this.scheduleRetry(op.tries);
            break;
          }
          this.outbox.shift();
          this.save();
          this.fail(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
          void this.reloadTable(op.table);
        }
      }
    } finally {
      this.flushing = false;
      this.emit();
    }
  }
}

export const store = new DataStore();

export function useStoreVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}

export function useRows<T = Row>(table: TableName): T[] {
  useStoreVersion();
  return store.rows<T>(table);
}

export function useStatus(): StoreStatus {
  useStoreVersion();
  return store.status;
}
