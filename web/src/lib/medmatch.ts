// Zuordnung handschriftlicher Medikamentennamen zu Planpunkten (für das Auslesen der Protokollfotos).

import type { Regimen } from "@shared/types.ts";

// Allgemeine Oberbegriffe, wie sie auf Protokollzetteln stehen, und typische Wirkstoffanfänge dazu.
const CLASS_WORDS: Record<string, string[]> = {
  cortison: ["predni", "dexa", "methylpred", "hydrocort", "budeso", "flutic"],
  kortison: ["predni", "dexa", "methylpred", "hydrocort", "budeso", "flutic"],
  magenschutz: ["omepra", "pantopra", "esomepra", "famoti", "sucral", "sucra"],
  inhalation: ["sole", "salz", "kochsalz", "inhal"],
  spray: ["dosier", "flutic", "salbu", "salmet"],
};

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !["mg", "tbl", "tablette", "beutel", "hub", "ml"].includes(w));
}

/** Gleicher Wortanfang: 4 Buchstaben bei Abkürzungen („Pred“), sonst 5 („Panto“), damit „Atemzüge“ nicht „Atemwege“ trifft. */
function prefixMatch(a: string, b: string): boolean {
  const n = Math.min(a.length, b.length);
  if (n < 4) return a === b;
  const k = n >= 5 ? 5 : 4;
  return a.slice(0, k) === b.slice(0, k);
}

/** Ordnet einen handschriftlichen Medikamentennamen einem Planpunkt zu (Wortanfang oder Oberbegriff). */
export function matchRegimen(regs: Regimen[], name: string): Regimen | null {
  const ws = words(name);
  if (!ws.length) return null;
  const candidates = regs.filter((r) => r.category === "med" || r.category === "inh");
  for (const r of candidates) {
    const rw = words(`${r.name} ${r.purpose || ""}`);
    if (ws.some((w) => rw.some((x) => prefixMatch(w, x) || (w.length >= 5 && x.includes(w))))) return r;
  }
  for (const w of ws) {
    const stems = CLASS_WORDS[w];
    if (!stems) continue;
    const hit = candidates.find((r) => words(r.name).some((x) => stems.some((st) => x.startsWith(st))));
    if (hit) return hit;
  }
  return null;
}
