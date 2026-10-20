import { describe, expect, it } from "vitest";
import { matchRegimen } from "../src/lib/medmatch";
import type { Regimen } from "@shared/types.ts";

const base = { slots: [], steps: [], active: true, notify: true, sort: 0 };
const regs: Regimen[] = [
  { ...base, id: "a", name: "Dexamethason", category: "med", purpose: "entzündungshemmend" },
  { ...base, id: "b", name: "Pantoprazol", category: "med", purpose: "Magenschutz" },
  { ...base, id: "c", name: "Inhalation Kochsalz", category: "inh" },
  { ...base, id: "d", name: "Beispielspray 1 Hub", category: "inh", purpose: "Atemwege (Dosierspray)" },
  { ...base, id: "e", name: "Atemzüge", category: "mess" },
];

describe("Medikamente vom Protokollfoto zuordnen", () => {
  it("über den Wortanfang", () => {
    expect(matchRegimen(regs, "Dexa ½")?.id).toBe("a");
    expect(matchRegimen(regs, "Panto 20 mg")?.id).toBe("b");
    expect(matchRegimen(regs, "Kochsalz inhaliert")?.id).toBe("c");
  });
  it("über Oberbegriffe und Teilwörter", () => {
    expect(matchRegimen(regs, "Cortison")?.id).toBe("a");
    expect(matchRegimen(regs, "Magenschutz")?.id).toBe("b");
    expect(matchRegimen(regs, "Spray")?.id).toBe("d");
  });
  it("Unbekanntes bleibt frei", () => {
    expect(matchRegimen(regs, "Unbekanntmittel 500")).toBeNull();
    expect(matchRegimen(regs, "Atemzüge")).toBeNull();
  });
});
