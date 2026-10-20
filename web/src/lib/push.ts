// Push-Erinnerungen: Abo im Browser anlegen, Einstellungen je Gerät speichern, Probe senden.
// iPhone/iPad: Push gibt es nur, wenn die App über „Zum Home-Bildschirm“ installiert wurde (iOS 16.4+).

import { backend } from "./config";

export interface PushPrefs {
  med: boolean;
  inh: boolean;
  mess: boolean;
  foto: boolean;
  feed: boolean;
  overdue: boolean;
}

export const DEFAULT_PREFS: PushPrefs = { med: true, inh: true, mess: true, foto: true, feed: false, overdue: true };

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

const TABLE = "push_subscriptions";

export function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  return reg || null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  const reg = await registration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await currentSubscription();
  return sub ? "on" : "off";
}

function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

function keysOf(sub: PushSubscription): { p256dh: string; auth: string } {
  const j = sub.toJSON();
  return { p256dh: j.keys?.p256dh || "", auth: j.keys?.auth || "" };
}

export async function loadPrefs(): Promise<PushPrefs> {
  const sub = await currentSubscription();
  if (!sub) return DEFAULT_PREFS;
  try {
    const rows = await backend.selectAll(TABLE, { endpoint: sub.endpoint });
    const prefs = rows[0]?.prefs as Partial<PushPrefs> | undefined;
    return { ...DEFAULT_PREFS, ...(prefs || {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function enablePush(prefs: PushPrefs): Promise<void> {
  if (!supported()) throw new Error(isIos() ? "Auf dem iPhone zuerst die App zum Home-Bildschirm hinzufügen und von dort öffnen." : "Dieser Browser unterstützt keine Push-Mitteilungen.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Mitteilungen wurden nicht erlaubt. Das lässt sich in den Einstellungen des Geräts ändern.");
  const reg = await registration();
  if (!reg) throw new Error("Der Hintergrunddienst der App läuft noch nicht. Bitte die App neu laden.");
  const { key } = await backend.invoke<{ key: string }>("push-key", {});
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) });
  await backend.upsert(TABLE, { endpoint: sub.endpoint, ...keysOf(sub), prefs, device: deviceName() });
}

export async function savePrefs(prefs: PushPrefs): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await backend.upsert(TABLE, { endpoint: sub.endpoint, ...keysOf(sub), prefs, device: deviceName() });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await backend.remove(TABLE, { endpoint: sub.endpoint });
  } finally {
    await sub.unsubscribe();
  }
}

export async function testPush(): Promise<number> {
  const r = await backend.invoke<{ sent: number }>("push-tick", { test: true });
  return r?.sent ?? 0;
}
