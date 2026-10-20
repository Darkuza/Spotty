import { describe, expect, it } from "vitest";
import { dayStats, fluidOfDay, foodOfDay, median } from "@shared/stats.ts";
import type { Entry } from "@shared/types.ts";

let n = 0;
const e = (time: string, type: Entry["type"], data: Record<string, unknown>, day = "2030-04-03"): Entry => ({ id: `e${++n}`, day, time, type, data });

describe("Tagesbilanz", () => {
  const entries: Entry[] = [
    e("07:30", "atem", { bpm: 44, zustand: "schlaeft" }),
    e("13:00", "atem", { bpm: 52, zustand: "ruhig" }),
    e("13:05", "atem", { bpm: 80, zustand: "aktiv" }),
    e("22:30", "atem", { bpm: 40, zustand: "schlaeft" }),
    e("08:00", "trinken", { ml: 30, weg: "spritze" }),
    e("12:00", "trinken", { ml: "25", weg: "selbst" }),
    e("08:05", "futter", { g: 58, reaktion: "unauffällig" }),
    e("18:00", "futter", { menge: "2 TL", art: "Frischkäse" }),
    e("19:00", "futter", { art: "Huhn", reaktion: "abgelehnt" }),
    e("09:00", "kot", { farbe: "schwarz, klebrig" }),
    e("07:45", "spo2", { pct: 96, pulsOk: "ja" }),
    e("22:40", "spo2", { pct: 88, pulsOk: "nein" }),
    e("10:00", "husten", { anzahl: 3 }),
    e("10:00", "atem", { bpm: 50 }, "2030-04-02"),
  ];
  const st = dayStats(entries, "2030-04-03", { day: "2030-04-03", paper_ml: 400, nacht: "ruhig" });

  it("Atemzüge: Tageswert ist der Median in Ruhe, ohne Werte nach Bewegung", () => {
    expect(st.atem).toHaveLength(4);
    expect(st.atemWert).toBe(44);
    expect(st.atemMin).toBe(40);
    expect(st.atemMax).toBe(52);
  });

  it("Trinken, Futter, Kot, SpO₂", () => {
    expect(st.trinkenMl).toBe(55);
    expect(st.selbstMl).toBe(25);
    expect(st.futterG).toBe(58);
    expect(st.futterOhneMenge).toEqual(["2 TL Frischkäse"]);
    expect(st.abgelehnt).toBe(1);
    expect(st.kotSchwarz).toBe(1);
    expect(st.spo2.map((s) => s.pct)).toEqual([96]);
    expect(st.husten).toBe(3);
    expect(st.nacht).toBe("ruhig");
  });

  it("Einträge haben Vorrang vor den Papier-Summen", () => {
    expect(fluidOfDay(st)).toEqual({ ml: 55, source: "einträge" });
    const paperOnly = dayStats([], "2030-04-04", { day: "2030-04-04", paper_ml: 450, paper_g: 300 });
    expect(fluidOfDay(paperOnly)).toEqual({ ml: 450, source: "papier" });
    expect(foodOfDay(paperOnly)).toEqual({ g: 300, source: "papier" });
  });

  it("Median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
