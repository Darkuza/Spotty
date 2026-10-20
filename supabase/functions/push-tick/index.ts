// Erinnerungen: wird alle 5 Minuten vom Zeitplan aufgerufen (Header x-cron-secret).
// Schickt für fällige und überfällige Punkte des Tagesplans eine Push-Mitteilung an alle Abos,
// deren Einstellungen die Kategorie erlauben. Jede Erinnerung geht je Person nur einmal raus.
// Mit Anmeldung und {"test": true} sendet die Funktion eine Probe-Mitteilung an die eigenen Geräte.

import { errorMessage, json, options, safeEqual } from "../_shared/http.ts";
import { adminClient, requireMember } from "../_shared/supa.ts";
import { sendPush, vapidConfigured, type PushPayload } from "../_shared/push.ts";
import { berlinNow, minutesOf } from "../_shared/dates.ts";
import { itemState, itemsForDay } from "../_shared/plan.ts";
import type { Check, Entry, Photo, PlanItem, Regimen } from "../_shared/types.ts";

const DUE_WINDOW = 20; // Minuten: so lange nach der Planzeit wird noch erinnert
const OVERDUE_AFTER = 30; // Minuten: Nachfrage bei Medikamenten, die nicht abgehakt sind

interface Sub {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  prefs: Record<string, boolean> | null;
  fail_count: number;
}

function wants(sub: Sub, it: PlanItem, kind: "due" | "overdue"): boolean {
  const prefs = sub.prefs || {};
  const cat = it.category === "care" ? "med" : it.category;
  if (prefs[cat] === false) return false;
  if (cat === "feed" && prefs.feed !== true) return false;
  if (kind === "overdue" && prefs.overdue === false) return false;
  return true;
}

function payloadFor(it: PlanItem, kind: "due" | "overdue", day: string): PushPayload {
  const verb = it.kind === "mess" ? "messen" : it.kind === "foto" ? "fotografieren" : it.category === "med" ? "geben" : "erledigen";
  if (kind === "overdue") {
    return { title: `Noch offen seit ${it.time}`, body: `${it.title} ist noch nicht abgehakt.`, tag: `${day}-${it.slot}`, url: "./#heute" };
  }
  return { title: `${it.time} · ${it.title}`, body: it.detail ? `Jetzt ${verb}: ${it.detail}` : `Jetzt ${verb}.`, tag: `${day}-${it.slot}`, url: "./#heute" };
}

async function handleTest(req: Request): Promise<Response> {
  const auth = await requireMember(req);
  if (auth instanceof Response) return auth;
  const { data: subs } = await auth.admin.from("push_subscriptions").select("*").eq("user_id", auth.user.id);
  let sent = 0;
  for (const s of (subs || []) as Sub[]) {
    const r = await sendPush(s, { title: "Spotty", body: "Probe: Erinnerungen auf diesem Gerät funktionieren.", tag: "test", url: "./#heute" }, 600);
    if (r === "ok") sent++;
    if (r === "gone") await auth.admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  return json({ ok: true, sent });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  if (!vapidConfigured()) return json({ error: "Push ist nicht eingerichtet." }, 503);
  try {
    const secret = Deno.env.get("CRON_SECRET") || "";
    const given = req.headers.get("x-cron-secret") || "";
    if (!given) {
      const body = await req.clone().json().catch(() => ({}));
      if (body && body.test) return await handleTest(req);
      return json({ error: "Nicht erlaubt." }, 403);
    }
    if (!safeEqual(given, secret)) return json({ error: "Nicht erlaubt." }, 403);

    const admin = adminClient();
    const now = berlinNow();
    const day = now.day;
    const [regsRes, checksRes, entriesRes, photosRes, subsRes, logRes] = await Promise.all([
      admin.from("regimens").select("*"),
      admin.from("checks").select("*").eq("day", day),
      admin.from("entries").select("id,day,time,type,slot,created_by").eq("day", day),
      admin.from("photos").select("id,day,time,created_by").eq("day", day),
      admin.from("push_subscriptions").select("*"),
      admin.from("push_log").select("slot,kind,user_id").eq("day", day),
    ]);
    const subs = (subsRes.data || []) as Sub[];
    if (!subs.length) return json({ ok: true, sent: 0, reason: "keine Abos" });

    const items = itemsForDay((regsRes.data || []) as Regimen[], day);
    const checks = (checksRes.data || []) as Check[];
    const entries = (entriesRes.data || []) as Entry[];
    const photos = (photosRes.data || []) as Photo[];
    const sentBefore = new Set((logRes.data || []).map((l: { slot: string; kind: string; user_id: string }) => `${l.slot}|${l.kind}|${l.user_id}`));

    const jobs: { it: PlanItem; kind: "due" | "overdue" }[] = [];
    for (const it of items) {
      if (!it.notify) continue;
      if (itemState(it, day, checks, entries, photos).done) continue;
      const t = minutesOf(it.time);
      if (t <= now.minutes && t > now.minutes - DUE_WINDOW) jobs.push({ it, kind: "due" });
      const o = t + OVERDUE_AFTER;
      if (it.kind === "check" && it.category === "med" && o <= now.minutes && o > now.minutes - DUE_WINDOW) jobs.push({ it, kind: "overdue" });
    }

    let sent = 0;
    const logRows: { day: string; slot: string; kind: string; user_id: string }[] = [];
    for (const job of jobs) {
      for (const sub of subs) {
        if (!wants(sub, job.it, job.kind)) continue;
        const key = `${job.it.slot}|${job.kind}|${sub.user_id}`;
        if (sentBefore.has(key)) continue;
        const r = await sendPush(sub, payloadFor(job.it, job.kind, day), 2 * 3600);
        if (r === "ok") {
          sent++;
          sentBefore.add(key);
          logRows.push({ day, slot: job.it.slot, kind: job.kind, user_id: sub.user_id });
          await admin.from("push_subscriptions").update({ last_ok: new Date().toISOString(), fail_count: 0 }).eq("endpoint", sub.endpoint);
        } else if (r === "gone") {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          await admin.from("push_subscriptions").update({ fail_count: (sub.fail_count || 0) + 1 }).eq("endpoint", sub.endpoint);
        }
      }
    }
    if (logRows.length) await admin.from("push_log").upsert(logRows, { onConflict: "day,slot,kind,user_id", ignoreDuplicates: true });
    return json({ ok: true, day, time: now.hm, jobs: jobs.length, sent });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
