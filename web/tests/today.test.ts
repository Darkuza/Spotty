import { describe, expect, it } from "vitest";
import { itemGiven, itemState, itemsForDay } from "@shared/plan.ts";
import { entryAlert, summarize } from "@shared/entryTypes.ts";
import type { Check, Entry, Regimen } from "@shared/types.ts";
import { earliestFor, fmtDuration, gapConflicts, gapRules } from "../src/lib/gaps";
import { dayInsights } from "../src/lib/insights";
import { ATEM, OME, PRED } from "./fixtures";

const DAY = "2030-04-03";

const SCHUTZ: Regimen = {
  id: "schutz",
  name: "Schutzfilm",
  category: "med",
  instructions: "in wenig Wasser · 2 h Abstand zu Magentest und Testmittel",
  slots: [
    { key: "s1", time: "10:00" },
    { key: "s2", time: "15:00" },
  ],
  steps: [{ from: "2030-04-02", to: null, dose: "¾ Beutel", amount: 0.75 }],
  active: true,
  notify: true,
  sort: 4,
};

const SPO: Regimen = {
  id: "spo",
  name: "SpO₂",
  category: "mess",
  measure: "spo2",
  slots: [
    { key: "sp1", time: "07:40" },
    { key: "sp2", time: "22:40" },
  ],
  steps: [{ from: "2030-04-02", to: null }],
  active: true,
  notify: true,
  sort: 5,
};

function e(day: string, time: string, type: Entry["type"], data: Record<string, unknown>, slot: string | null = null): Entry {
  return { id: `${day}-${time}-${type}`, day, time, type, data, slot } as Entry;
}

describe("Ausgelassen", () => {
  it("ein ausgelassenes Häkchen gilt als erledigt, aber nicht als gegeben", () => {
    const items = itemsForDay([PRED], DAY);
    const checks: Check[] = [{ day: DAY, slot: "pred", time: "08:10", skipped: true }];
    const st = itemState(items[0], DAY, checks, [], []);
    expect(st.done).toBe(true);
    expect(st.skipped).toBe(true);
    expect(itemGiven(st)).toBe(false);
  });

  it("Messungen lassen sich auslassen; ein späterer Eintrag hat Vorrang", () => {
    const items = itemsForDay([ATEM], DAY);
    const checks: Check[] = [{ day: DAY, slot: "af1", time: "07:35", skipped: true }];
    expect(itemState(items[0], DAY, checks, [], []).skipped).toBe(true);
    const entries = [e(DAY, "08:00", "atem", { bpm: 30 }, "af1")];
    const st = itemState(items[0], DAY, checks, entries, []);
    expect(st.done && !st.skipped).toBe(true);
  });

  it("ein normales Häkchen bei einer Messung zählt nicht", () => {
    const items = itemsForDay([ATEM], DAY);
    const checks: Check[] = [{ day: DAY, slot: "af1", time: "07:35" }];
    expect(itemState(items[0], DAY, checks, [], []).done).toBe(false);
  });
});

describe("Abstandsregeln", () => {
  const regs = [PRED, OME, SCHUTZ];
  const items = itemsForDay(regs, DAY);

  it("liest die Regel aus der Anleitung", () => {
    const rules = gapRules(regs);
    expect(rules).toHaveLength(1);
    expect(rules[0].minutes).toBe(120);
    expect(rules[0].others.sort()).toEqual(["ome", "pred"]);
  });

  it("meldet Gaben, die zu nah beieinander lagen", () => {
    const checks: Check[] = [
      { day: DAY, slot: "ome", time: "10:00" },
      { day: DAY, slot: "pred", time: "11:05" },
      { day: DAY, slot: "s1", time: "11:50" },
      { day: DAY, slot: "s2", time: "14:50" },
    ];
    const c = gapConflicts(regs, items, DAY, checks);
    expect(c.filter((x) => x.slot === "s1").map((x) => x.diff).sort((a, b) => a - b)).toEqual([45, 110]);
    expect(c.some((x) => x.slot === "s2")).toBe(false);
    expect(c.find((x) => x.diff === 45)?.after).toBe(true);
  });

  it("ausgelassene Gaben zählen nicht", () => {
    const checks: Check[] = [
      { day: DAY, slot: "pred", time: "11:05", skipped: true },
      { day: DAY, slot: "s1", time: "11:50" },
    ];
    expect(gapConflicts(regs, items, DAY, checks)).toHaveLength(0);
  });

  it("nennt die früheste Uhrzeit für die nächste Gabe, auch in Gegenrichtung", () => {
    const checks: Check[] = [{ day: DAY, slot: "pred", time: "11:05" }];
    const s1 = items.find((x) => x.slot === "s1")!;
    expect(earliestFor(regs, items, DAY, checks, s1)?.at).toBe("13:05");
    const checks2: Check[] = [{ day: DAY, slot: "s1", time: "10:00" }];
    const pred = items.find((x) => x.slot === "pred")!;
    expect(earliestFor(regs, items, DAY, checks2, pred)?.at).toBe("12:00");
  });

  it("formatiert Dauern", () => {
    expect(fmtDuration(45)).toBe("45 Minuten");
    expect(fmtDuration(120)).toBe("2 Stunden");
    expect(fmtDuration(110)).toBe("1 Std. 50 Min.");
  });
});

describe("Hinweise für Heute", () => {
  const now = { day: DAY, minutes: 19 * 60 + 10, hm: "19:10", seconds: 0 };

  it("Trinkt wieder selbst nach Tagen nur per Spritze", () => {
    const entries = [e("2030-04-02", "10:00", "trinken", { ml: 50, weg: "spritze" }), e(DAY, "10:43", "trinken", { ml: 100, weg: "selbst" })];
    const xs = dayInsights(entries, [], null, DAY, now);
    expect(xs.find((x) => x.key === "selbst")?.text).toContain("100 ml selbst");
  });

  it("Kot und Urin fehlen am Abend nur, wenn sie sonst eingetragen werden", () => {
    const entries = [e("2030-04-02", "09:00", "kot", { form: "fest" })];
    const xs = dayInsights(entries, [], null, DAY, now);
    expect(xs.find((x) => x.key === "aus")?.title).toBe("Kot fehlt noch");
    expect(dayInsights(entries, [], null, DAY, { ...now, minutes: 12 * 60 }).find((x) => x.key === "aus")).toBeUndefined();
  });

  it("SpO₂ laut Plan, aber nie gemessen", () => {
    const xs = dayInsights([], [SPO], null, DAY, now);
    expect(xs.find((x) => x.key === "spo2")?.title).toBe("SpO₂ noch nicht gemessen");
  });

  it("kündigt den Dosiswechsel am Vortag an", () => {
    const xs = dayInsights([], [PRED], null, "2030-04-11", { ...now, day: "2030-04-11" });
    expect(xs.find((x) => x.key === "dose-pred")?.title).toBe("Ab morgen Testmittel 15 mg");
  });
});

describe("Befinden", () => {
  it("fasst das Befinden zusammen und warnt bei „schlecht“", () => {
    expect(summarize({ type: "notiz", data: { befinden: "unsicher" } })).toBe("Befinden nicht sicher");
    expect(entryAlert({ type: "notiz", data: { befinden: "schlecht" } })?.level).toBe("warn");
    expect(entryAlert({ type: "notiz", data: { befinden: "gut" } })).toBeNull();
  });
});
