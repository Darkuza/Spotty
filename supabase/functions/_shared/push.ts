// Web Push mit VAPID-Schlüsseln aus dem Secret VAPID_KEYS (JSON mit publicKey/privateKey als JWK, auch base64-kodiert).

import * as webpush from "jsr:@negrel/webpush@0.5.0";

let serverPromise: Promise<{ server: webpush.ApplicationServer; publicKey: string }> | null = null;

export function vapidConfigured(): boolean {
  return !!Deno.env.get("VAPID_KEYS");
}

export function pushServer(): Promise<{ server: webpush.ApplicationServer; publicKey: string }> {
  if (!serverPromise) {
    serverPromise = (async () => {
      const raw = (Deno.env.get("VAPID_KEYS") || "").trim();
      if (!raw) throw new Error("VAPID_KEYS ist nicht eingerichtet.");
      // als JSON oder (vom Deployment) base64-kodiertes JSON
      const text = raw.startsWith("{") ? raw : new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
      const exported = JSON.parse(text) as webpush.ExportedVapidKeys;
      const vapidKeys = await webpush.importVapidKeys(exported, { extractable: false });
      const contact = Deno.env.get("PUSH_CONTACT") || "mailto:spotty@example.invalid";
      const server = await webpush.ApplicationServer.new({ contactInformation: contact.startsWith("mailto:") ? contact : `mailto:${contact}`, vapidKeys });
      const publicKey = await webpush.exportApplicationServerKey(vapidKeys);
      return { server, publicKey };
    })();
  }
  return serverPromise;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export type PushResult = "ok" | "gone" | "error";

export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload, ttlSeconds = 3600): Promise<PushResult> {
  const { server } = await pushServer();
  const subscriber = server.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
  try {
    await subscriber.pushTextMessage(JSON.stringify(payload), { ttl: ttlSeconds, urgency: webpush.Urgency.High });
    return "ok";
  } catch (e) {
    if (e instanceof webpush.PushMessageError) {
      const status = e.response.status;
      if (status === 404 || status === 410) return "gone";
    }
    return "error";
  }
}
