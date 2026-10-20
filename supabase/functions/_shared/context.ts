// Lädt alle Daten, die Claude als Wissensstand bekommt.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import type { ContextData } from "./contextText.ts";
import { addDays, berlinNow } from "./dates.ts";

// deno-lint-ignore no-explicit-any
type Builder = any;

export async function loadContextData(client: SupabaseClient, daysBack = 14): Promise<ContextData> {
  const today = berlinNow().day;
  const from = addDays(today, -daysBack);
  const all = async (table: string, build?: (b: Builder) => Builder) => {
    let qb: Builder = client.from(table).select("*");
    if (build) qb = build(qb);
    const { data, error } = await qb;
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  };
  const [profileRes, regimens, documents, labs, events, questions, entries, checks, days, photos, members] = await Promise.all([
    client.from("profile").select("*").eq("id", 1).maybeSingle(),
    all("regimens"),
    all("documents"),
    all("labs", (b) => b.order("date").limit(2000)),
    all("events", (b) => b.order("date").limit(2000)),
    all("questions"),
    all("entries", (b) => b.gte("day", from).order("day").limit(5000)),
    all("checks", (b) => b.gte("day", from).limit(5000)),
    all("days", (b) => b.gte("day", from)),
    all("photos", (b) => b.gte("day", from)),
    all("members"),
  ]);
  return {
    profile: profileRes.data ?? null,
    regimens,
    documents,
    labs,
    events,
    questions,
    entries,
    checks,
    days,
    photos,
    members,
  } as ContextData;
}
