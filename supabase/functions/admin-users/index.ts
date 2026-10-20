// Mitgliederverwaltung: Konten anlegen, ändern, entfernen (nur Admins).
// Aktion "bootstrap" legt beim Deployment das erste Admin-Konto an (Header x-bootstrap-secret).

import { errorMessage, json, options, safeEqual } from "../_shared/http.ts";
import { adminClient, requireMember } from "../_shared/supa.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

function validEmail(e: unknown): e is string {
  return typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
}

function validPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 8;
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureUser(admin: SupabaseClient, email: string, password: string, name: string): Promise<{ id: string; created: boolean }> {
  const existing = await findUserId(admin, email);
  if (existing) return { id: existing, created: false };
  const { data, error } = await admin.auth.admin.createUser({ email: email.trim(), password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw error || new Error("Konto konnte nicht angelegt werden.");
  return { id: data.user.id, created: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "bootstrap") {
      const secret = Deno.env.get("CRON_SECRET") || "";
      if (!safeEqual(req.headers.get("x-bootstrap-secret") || "", secret)) return json({ error: "Nicht erlaubt." }, 403);
      if (!validEmail(body.email) || !validPassword(body.password)) return json({ error: "E-Mail oder Passwort (mind. 8 Zeichen) fehlt." }, 400);
      const admin = adminClient();
      const name = String(body.name || "Admin").slice(0, 60);
      const { id, created } = await ensureUser(admin, body.email, body.password, name);
      // Vorhandenes Mitglied behält Namen und Passwort; es wird nur sichergestellt, dass es Admin ist.
      const { data: existing } = await admin.from("members").select("user_id").eq("user_id", id).maybeSingle();
      const { error } = existing
        ? await admin.from("members").update({ role: "admin" }).eq("user_id", id)
        : await admin.from("members").insert({ user_id: id, email: body.email.trim().toLowerCase(), name, role: "admin" });
      if (error) throw error;
      return json({ ok: true, created });
    }

    const auth = await requireMember(req, { admin: action !== "list" });
    if (auth instanceof Response) return auth;
    const admin = auth.admin;

    if (action === "list") {
      const { data, error } = await admin.from("members").select("user_id,email,name,role,created_at").order("created_at");
      if (error) throw error;
      const result = [];
      for (const m of data || []) {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id);
        result.push({ ...m, last_sign_in_at: u?.user?.last_sign_in_at ?? null });
      }
      return json({ ok: true, members: result });
    }

    if (action === "create") {
      if (!validEmail(body.email)) return json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
      if (!validPassword(body.password)) return json({ error: "Das Startpasswort braucht mindestens 8 Zeichen." }, 400);
      const name = String(body.name || "").trim().slice(0, 60);
      if (!name) return json({ error: "Bitte einen Namen angeben." }, 400);
      const role = body.role === "admin" ? "admin" : "member";
      const { id, created } = await ensureUser(admin, body.email, body.password, name);
      if (!created) await admin.auth.admin.updateUserById(id, { password: body.password, user_metadata: { name } });
      const { error } = await admin.from("members").upsert({ user_id: id, email: body.email.trim().toLowerCase(), name, role }, { onConflict: "user_id" });
      if (error) throw error;
      return json({ ok: true, user_id: id, created });
    }

    if (action === "update") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ error: "user_id fehlt." }, 400);
      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 60);
      if (body.role === "admin" || body.role === "member") {
        if (userId === auth.user.id && body.role !== "admin") return json({ error: "Die eigene Admin-Rolle kann nicht entzogen werden." }, 400);
        patch.role = body.role;
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from("members").update(patch).eq("user_id", userId);
        if (error) throw error;
      }
      if (body.password !== undefined) {
        if (!validPassword(body.password)) return json({ error: "Das Passwort braucht mindestens 8 Zeichen." }, 400);
        const { error } = await admin.auth.admin.updateUserById(userId, { password: body.password });
        if (error) throw error;
      }
      return json({ ok: true });
    }

    if (action === "remove") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ error: "user_id fehlt." }, 400);
      if (userId === auth.user.id) return json({ error: "Das eigene Konto kann hier nicht entfernt werden." }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unbekannte Aktion." }, 400);
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
