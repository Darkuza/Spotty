// Farben und Symbole je Kategorie, gemeinsam für Plan, Protokoll und Akte.

import type { Category, EntryType, Measure } from "@shared/types.ts";

export const CAT_LABEL: Record<Category, string> = {
  med: "Medikament",
  inh: "Inhalation",
  feed: "Futter",
  mess: "Messen",
  foto: "Protokoll",
  care: "Pflege",
};

export type Kind = "med" | "mess" | "food" | "inh" | "aus" | "obs" | "red";

export interface KindStyle {
  kind: Kind;
  icon: string;
}

const MEASURE_ICON: Record<Measure, string> = { atem: "lungs", spo2: "pulse", gewicht: "scale" };

export function categoryStyle(cat: Category, measure?: Measure | null): KindStyle {
  switch (cat) {
    case "med":
      return { kind: "med", icon: "pill" };
    case "inh":
      return { kind: "inh", icon: "wind" };
    case "feed":
      return { kind: "food", icon: "bowl" };
    case "mess":
      return { kind: "mess", icon: measure ? MEASURE_ICON[measure] : "pulse" };
    case "foto":
      return { kind: "aus", icon: "camera" };
    default:
      return { kind: "obs", icon: "heart" };
  }
}

export const ENTRY_STYLE: Record<EntryType, KindStyle> = {
  atem: { kind: "mess", icon: "lungs" },
  spo2: { kind: "mess", icon: "pulse" },
  gewicht: { kind: "mess", icon: "scale" },
  trinken: { kind: "food", icon: "drop" },
  futter: { kind: "food", icon: "bowl" },
  kot: { kind: "aus", icon: "stool" },
  urin: { kind: "aus", icon: "urine" },
  gassi: { kind: "aus", icon: "route" },
  husten: { kind: "obs", icon: "cough" },
  erbrechen: { kind: "obs", icon: "nausea" },
  med: { kind: "med", icon: "pill" },
  notiz: { kind: "obs", icon: "eye" },
};
