/// <reference lib="webworker" />
// Hintergrunddienst: App-Dateien offline vorhalten, Push-Erinnerungen anzeigen, beim Antippen die App öffnen.

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") void self.skipWaiting();
});

interface PushData {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = { title: "Spotty", body: "" };
  try {
    data = { ...data, ...(event.data?.json() as Partial<PushData>) };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  const options: NotificationOptions & { renotify?: boolean } = {
    body: data.body,
    tag: data.tag,
    renotify: !!data.tag,
    icon: "icon-192.png",
    badge: "badge-72.png",
    lang: "de",
    data: { url: data.url || "./" },
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of windows) {
        if (c.url.startsWith(self.registration.scope)) {
          await c.focus();
          try {
            await c.navigate(target);
          } catch {
            /* Navigation nicht erlaubt – Fokus genügt */
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
