// Supabase-Clients und Prüfung der Mitgliedschaft in Edge Functions.
// Unterstützt die neuen Schlüssel (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS) und die älteren (service_role / anon).

import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.117.2";
import { json } from "./http.ts";
import type { Member } from "./types.ts";

function firstKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return trimmed || null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj.default === "string") return obj.default;
    for (const v of Object.values(obj)) if (typeof v === "string" && v) return v;
  } catch {
    return null;
  }
  return null;
}

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

export function secretKey(): string {
  return firstKey(Deno.env.get("SUPABASE_SECRET_KEYS")) || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

export function publishableKey(): string {
  return firstKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) || Deno.env.get("SUPABASE_ANON_KEY") || "";
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, publishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthContext {
  user: User;
  member: Member;
  admin: SupabaseClient;
  client: SupabaseClient;
}

/** Prüft das Anmelde-Token und die Mitgliedschaft. Gibt bei Fehlern eine fertige Antwort zurück. */
export async function requireMember(req: Request, opts: { admin?: boolean } = {}): Promise<AuthContext | Response> {
  const header = req.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Nicht angemeldet." }, 401);
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Die Anmeldung ist abgelaufen. Bitte neu anmelden." }, 401);
  const { data: member } = await admin.from("members").select("user_id,email,name,role").eq("user_id", data.user.id).maybeSingle();
  if (!member) return json({ error: "Dieses Konto ist kein Mitglied von Spotty." }, 403);
  if (opts.admin && member.role !== "admin") return json({ error: "Nur für Admins." }, 403);
  return { user: data.user, member: member as Member, admin, client: userClient(token) };
}
