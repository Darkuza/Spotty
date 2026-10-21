import { describe, expect, it } from "vitest";
import { sameEntry } from "../src/lib/entryMatch";

const at = (time: string, type: "atem" | "kot" | "futter", data: Record<string, unknown>) => ({ day: "2030-04-10", time, type, data });

describe("Doppelte Einträge beim Import", () => {
  it("gleiche Minute, gleiche Art, gleicher Wert", () => {
    expect(sameEntry(at("22:52", "atem", { bpm: 55, lage: "rechts" }), at("22:52", "atem", { bpm: 55 }))).toBe(true);
  });
  it("anderer Wert oder andere Minute ist ein eigener Eintrag", () => {
    expect(sameEntry(at("22:52", "atem", { bpm: 55 }), at("22:52", "atem", { bpm: 46 }))).toBe(false);
    expect(sameEntry(at("22:52", "atem", { bpm: 55 }), at("22:56", "atem", { bpm: 55 }))).toBe(false);
  });
  it("Arten ohne Zahlenwert: gleiche Minute genügt", () => {
    expect(sameEntry(at("08:50", "kot", { form: "fest" }), at("08:50", "kot", { form: "fest", farbe: "braun" }))).toBe(true);
  });
  it("Futter mit und ohne Grammangabe sind verschieden", () => {
    expect(sameEntry(at("16:50", "futter", { g: 100 }), at("16:50", "futter", { menge: "1 TL" }))).toBe(false);
  });
});
