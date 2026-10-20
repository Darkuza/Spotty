import { describe, expect, it } from "vitest";
import { entryAlert, fmtNum, num, summarize, TYPES, QUICK_ORDER } from "@shared/entryTypes.ts";

describe("Eintragsarten", () => {
  it("jede Art in der Schnellauswahl ist definiert", () => {
    for (const t of QUICK_ORDER) expect(TYPES[t]).toBeDefined();
  });

  it("Zahlen mit Komma", () => {
    expect(num("21,4")).toBe(21.4);
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
    expect(fmtNum(21.44, 1)).toBe("21,4");
    expect(fmtNum(null)).toBe("–");
  });

  it("Kurztext eines Eintrags", () => {
    expect(summarize({ type: "gewicht", data: { kg: 21.4 } })).toBe("21,4 kg");
    expect(summarize({ type: "atem", data: { bpm: 44, zustand: "schlaeft" } })).toContain("44/min");
  });

  it("Warnregeln", () => {
    expect(entryAlert({ type: "kot", data: { farbe: "schwarz, klebrig" } })?.level).toBe("crit");
    expect(entryAlert({ type: "kot", data: { auff: ["frisches Blut"] } })?.level).toBe("warn");
    expect(entryAlert({ type: "erbrechen", data: { blut: "ja" } })?.level).toBe("crit");
    expect(entryAlert({ type: "erbrechen", data: {} })?.level).toBe("info");
    expect(entryAlert({ type: "spo2", data: { pct: 89 } })?.level).toBe("crit");
    expect(entryAlert({ type: "spo2", data: { pct: 93 } })?.level).toBe("warn");
    expect(entryAlert({ type: "spo2", data: { pct: 89, pulsOk: "nein" } })?.level).toBe("info");
    expect(entryAlert({ type: "spo2", data: { pct: 97 } })).toBeNull();
    expect(entryAlert({ type: "futter", data: { reaktion: "Schmerzreaktion" } })?.level).toBe("warn");
  });
});
