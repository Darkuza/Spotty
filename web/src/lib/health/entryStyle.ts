// Symbol und Farbe einer Eintragsart, passend zur Kategorie ihres Messwerts.

import type { EntryType } from "@shared/types.ts";
import { catColor, metricOfEntry } from "./metrics";

export function quickStyle(t: EntryType): { glyph: string; color: string } {
  if (t === "med") return { glyph: "capsule", color: catColor("medikamente") };
  const m = metricOfEntry(t);
  return { glyph: m?.glyph || "notes", color: m ? catColor(m.cat) : "var(--blue)" };
}
