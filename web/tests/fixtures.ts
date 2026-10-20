// Erfundene Testdaten (keine echten Angaben).
import type { Regimen } from "@shared/types.ts";

export const PRED: Regimen = {
  id: "pred",
  name: "Testmittel",
  category: "med",
  slots: [{ key: "pred", time: "08:00" }],
  steps: [
    { from: "2030-04-02", to: "2030-04-11", dose: "20 mg", label: "1 Tablette", amount: 1 },
    { from: "2030-04-12", to: "2030-04-25", dose: "15 mg", label: "¾ Tablette", amount: 0.75 },
    { from: "2030-04-26", to: "2030-05-09", dose: "10 mg", label: "½ Tablette", amount: 0.5 },
  ],
  active: true,
  notify: true,
  sort: 2,
};

export const OME: Regimen = {
  id: "ome",
  name: "Magentest",
  category: "med",
  slots: [{ key: "ome", time: "07:00" }],
  steps: [
    { from: "2030-04-02", to: "2030-04-15", dose: "20 mg", amount: 1 },
    { from: "2030-04-16", to: "2030-04-25", dose: "20 mg", amount: 1, pattern: "alternate", anchor: "2030-04-17" },
  ],
  active: true,
  notify: true,
  sort: 1,
};

export const ATEM: Regimen = {
  id: "atem",
  name: "Atemzüge",
  category: "mess",
  measure: "atem",
  slots: [
    { key: "af1", time: "07:30", label: "morgens" },
    { key: "af3", time: "22:30", label: "abends" },
  ],
  steps: [{ from: "2030-04-02", to: null }],
  active: true,
  notify: true,
  sort: 0,
};

export const WEIGHT: Regimen = {
  id: "kg",
  name: "Gewicht",
  category: "mess",
  measure: "gewicht",
  slots: [{ key: "kg", time: "07:50" }],
  steps: [{ from: "2030-04-02", to: null, pattern: "weekdays", weekdays: [1, 2, 4, 6] }],
  active: true,
  notify: true,
  sort: 3,
};
