// Symbol und Farbe eines Planpunkts, passend zu den Kategorien von „Entdecken“.

import type { Category, Measure, PlanItem, Regimen } from "@shared/types.ts";

const MEASURE: Record<Measure, { glyph: string; cat: string }> = {
  atem: { glyph: "lungs", cat: "atmung" },
  spo2: { glyph: "o2", cat: "atmung" },
  gewicht: { glyph: "scale", cat: "koerper" },
};

export function styleOf(category: Category, measure?: Measure | null): { glyph: string; color: string; label: string } {
  switch (category) {
    case "med":
      return { glyph: "capsule", color: "var(--c-medikamente)", label: "Medikamente" };
    case "inh":
      return { glyph: "wind", color: "var(--c-medikamente)", label: "Inhalation" };
    case "feed":
      return { glyph: "bowl", color: "var(--c-ernaehrung)", label: "Futter" };
    case "mess": {
      const m = measure ? MEASURE[measure] : null;
      return { glyph: m?.glyph || "pulse", color: `var(--c-${m?.cat || "vital"})`, label: "Messen" };
    }
    case "foto":
      return { glyph: "camera", color: "var(--c-andere)", label: "Papierprotokoll" };
    default:
      return { glyph: "heart", color: "var(--c-befinden)", label: "Pflege" };
  }
}

export function itemGlyph(it: PlanItem): string {
  return styleOf(it.category, it.measure).glyph;
}

export function itemColor(it: PlanItem): string {
  return styleOf(it.category, it.measure).color;
}

export function regimenStyle(r: Regimen) {
  return styleOf(r.category, r.measure);
}
