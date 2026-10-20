// Liefert den öffentlichen VAPID-Schlüssel für das Push-Abo im Browser.

import { errorMessage, json, options } from "../_shared/http.ts";
import { pushServer, vapidConfigured } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  if (!vapidConfigured()) return json({ error: "Push ist auf dem Server noch nicht eingerichtet." }, 503);
  try {
    const { publicKey } = await pushServer();
    return json({ key: publicKey });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
