import { describe, expect, it } from "vitest";
import { autoSlot, fmtAmount, itemState, itemsForDay, nextChange, stepFor, stockProjection } from "@shared/plan.ts";
import { ATEM, OME, PRED, WEIGHT } from "./fixtures";

describe("Plan-Engine", () => {
  it("wählt die Dosisstufe nach Datum", () => {
    expect(stepFor(PRED, "2030-04-01")).toBeNull();
    expect(stepFor(PRED, "2030-04-02")?.dose).toBe("20 mg");
    expect(stepFor(PRED, "2030-04-11")?.dose).toBe("20 mg");
    expect(stepFor(PRED, "2030-04-12")?.dose).toBe("15 mg");
    expect(stepFor(PRED, "2030-05-10")).toBeNull();
  });

  it("Stufenplan: täglich, danach jeden zweiten Tag", () => {
    const days = ["2030-04-15", "2030-04-16", "2030-04-17", "2030-04-18", "2030-04-19", "2030-04-25", "2030-04-26"];
    expect(days.map((d) => !!stepFor(OME, d))).toEqual([true, false, true, false, true, true, false]);
  });

  it("Gewicht nur an Mo, Di, Do, Sa", () => {
    // 2030-04-02 ist ein Dienstag
    const week = ["2030-04-01", "2030-04-02", "2030-04-03", "2030-04-04", "2030-04-05", "2030-04-06", "2030-04-07"];
    expect(week.map((d) => !!stepFor(WEIGHT, d))).toEqual([false, true, false, true, false, true, false]);
  });

  it("sortiert die Punkte eines Tages nach Uhrzeit und baut Titel", () => {
    const items = itemsForDay([PRED, OME, ATEM], "2030-04-03");
    expect(items.map((i) => i.time)).toEqual(["07:00", "07:30", "08:00", "22:30"]);
    expect(items[2].title).toBe("Testmittel 20 mg");
    expect(items[1].title).toBe("Atemzüge morgens");
    expect(items[1].kind).toBe("mess");
  });

  it("pausierte Pläne erscheinen nicht", () => {
    expect(itemsForDay([{ ...PRED, active: false }], "2030-04-03")).toHaveLength(0);
  });

  it("erkennt erledigte Punkte über Häkchen und Messungen", () => {
    const items = itemsForDay([PRED, ATEM], "2030-04-03");
    const checks = [{ day: "2030-04-03", slot: "pred", time: "08:05", created_by: "u1" }];
    const entries = [{ id: "e1", day: "2030-04-03", time: "07:33", type: "atem" as const, data: { bpm: 40 }, slot: "af1", created_by: "u2" }];
    const st = items.map((it) => itemState(it, "2030-04-03", checks, entries, []));
    expect(st.map((s) => s.done)).toEqual([true, true, false]);
    expect(st[0].at).toBe("07:33");
    expect(st[1].by).toBe("u1");
  });

  it("ordnet Messungen dem nächsten freien Slot zu", () => {
    const items = itemsForDay([ATEM], "2030-04-03");
    expect(autoSlot(items, "atem", "07:10", new Set())).toBe("af1");
    expect(autoSlot(items, "atem", "07:10", new Set(["af1"]))).toBeNull();
    expect(autoSlot(items, "atem", "21:00", new Set())).toBe("af3");
    expect(autoSlot(items, "atem", "14:00", new Set())).toBeNull();
  });

  it("nennt die nächste Dosisänderung", () => {
    expect(nextChange(PRED, "2030-04-07")).toMatchObject({ day: "2030-04-12" });
    expect(nextChange(PRED, "2030-04-07")?.step?.dose).toBe("15 mg");
    expect(nextChange(PRED, "2030-05-03")).toMatchObject({ day: "2030-05-10", step: null });
  });

  it("rechnet die Reichweite eines Vorrats", () => {
    // ab Tag 1, 08:30: 9 × 1 + 14 × 0,75 + 14 × 0,5 = 26,5 Tabletten bis Planende
    const p = stockProjection(PRED, 20, "2030-04-02", 8 * 60 + 30);
    expect(p.needed).toBe(26.5);
    expect(p.remainingAtEnd).toBe(-6.5);
    expect(p.runsOut?.day).toBeDefined();
    const enough = stockProjection(PRED, 30, "2030-04-02", 8 * 60 + 30);
    expect(enough.runsOut).toBeNull();
    expect(enough.remainingAtEnd).toBe(3.5);
  });

  it("zeigt Bruchteile lesbar an", () => {
    expect(fmtAmount(0.75)).toBe("¾");
    expect(fmtAmount(1.5)).toBe("1 ½");
    expect(fmtAmount(2)).toBe("2");
    expect(fmtAmount(0.3)).toBe("0,3");
  });
});
