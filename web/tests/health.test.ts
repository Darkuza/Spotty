// Messreihen, Zeiträume, Kopfzahlen, Achsen, Highlights und Trends der Health-Ansichten.
// Erfundene Testdaten (keine echten Angaben).
import { describe, expect, it } from "vitest";
import type { Check, DayNote, Entry } from "@shared/types.ts";
import { addDays, weekday } from "@shared/dates.ts";
import { metricOf, unitFor, type MetricDef } from "../src/lib/health/metrics";
import { colValues, dayValues, periodOf, planDays, samplesOf, scaleFor, summaryOf, sumUntil, type Sources } from "../src/lib/health/series";
import { highlightsOf, trendOf } from "../src/lib/health/highlights";
import { OME, PRED } from "./fixtures";

const TODAY = "2030-04-10"; // ein Mittwoch

function e(day: string, time: string, type: Entry["type"], data: Record<string, unknown>): Entry {
  return { id: `${day}-${time}-${type}-${JSON.stringify(data)}`, day, time, type, data, slot: null };
}

function src(entries: Entry[], notes: DayNote[] = []): Sources {
  return { entries, notes, photos: [], weights: [] };
}

function def(id: string): MetricDef {
  const d = metricOf(id);
  if (!d) throw new Error(id);
  return d;
}

describe("Zeiträume", () => {
  it("Woche: sieben Tage bis heute mit Wochentagen", () => {
    const p = periodOf("W", 0, TODAY);
    expect(p.cols).toHaveLength(7);
    expect(p.from).toBe(addDays(TODAY, -6));
    expect(p.to).toBe(TODAY);
    expect(p.cols[6].label).toBe("Mi");
    expect(p.title).toBe("4.–10. Apr. 2030");
  });

  it("eine Woche früher verschiebt um sieben Tage", () => {
    const p = periodOf("W", -1, TODAY);
    expect(p.to).toBe(addDays(TODAY, -7));
  });

  it("Monat: 30 Tage, beschriftet nur montags", () => {
    const p = periodOf("M", 0, TODAY);
    expect(p.cols).toHaveLength(30);
    for (const c of p.cols) expect(c.label !== null).toBe(weekday(c.from) === 1);
  });

  it("6 Monate: 26 Wochen ab Montag, Monatsnamen an der Woche mit dem Ersten", () => {
    const p = periodOf("6M", 0, TODAY);
    expect(p.cols).toHaveLength(26);
    expect(weekday(p.cols[0].from)).toBe(1);
    const labeled = p.cols.filter((c) => c.label);
    for (const c of labeled) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(c.from, i));
      expect(days.some((d) => d.endsWith("-01"))).toBe(true);
    }
    expect(p.cols[p.cols.length - 1].to >= TODAY).toBe(true);
  });

  it("Jahr: zwölf Monate mit Anfangsbuchstaben", () => {
    const p = periodOf("J", 0, TODAY);
    expect(p.cols).toHaveLength(12);
    expect(p.cols[11].from).toBe("2030-04-01");
    expect(p.cols[11].label).toBe("A");
  });

  it("Tag: 24 Stunden, beschriftet alle sechs Stunden", () => {
    const p = periodOf("T", 0, TODAY);
    expect(p.cols).toHaveLength(24);
    expect(p.cols.filter((c) => c.label).map((c) => c.label)).toEqual(["00", "06", "12", "18"]);
  });
});

describe("Messreihen", () => {
  it("Atemzüge nach Bewegung zählen nicht in den Bereich", () => {
    const d = def("atem");
    const s = samplesOf(d, src([e(TODAY, "07:30", "atem", { bpm: 32, zustand: "schlaeft" }), e(TODAY, "12:00", "atem", { bpm: 60, zustand: "aktiv" }), e(TODAY, "22:00", "atem", { bpm: 36 })]));
    const dv = dayValues(d, s).get(TODAY)!;
    expect(dv.lo).toBe(32);
    expect(dv.hi).toBe(36);
    expect(dv.n).toBe(3);
    expect(s.find((x) => x.v === 60)?.hollow).toBe(true);
  });

  it("die Tagessumme vom Papier zählt nur an Tagen ohne Einzeleinträge", () => {
    const d = def("trinken");
    const notes: DayNote[] = [
      { day: TODAY, paper_ml: 999 },
      { day: addDays(TODAY, -1), paper_ml: 400 },
    ];
    const s = samplesOf(d, src([e(TODAY, "08:00", "trinken", { ml: 50 })], notes));
    const days = dayValues(d, s);
    expect(days.get(TODAY)?.total).toBe(50);
    expect(days.get(addDays(TODAY, -1))?.total).toBe(400);
    expect(sumUntil(s, addDays(TODAY, -1), 1439)).toBe(0);
  });

  it("abgelehntes Futter zählt nicht", () => {
    const d = def("futter");
    const s = samplesOf(d, src([e(TODAY, "08:00", "futter", { g: 100 }), e(TODAY, "09:00", "futter", { g: 80, reaktion: "abgelehnt" })]));
    expect(dayValues(d, s).get(TODAY)?.total).toBe(100);
  });
});

describe("Kopfzahl", () => {
  it("der Durchschnitt rechnet nur abgeschlossene Tage", () => {
    const d = def("trinken");
    const entries = [e(addDays(TODAY, -2), "10:00", "trinken", { ml: 300 }), e(addDays(TODAY, -1), "10:00", "trinken", { ml: 500 }), e(TODAY, "10:00", "trinken", { ml: 50 })];
    const s = samplesOf(d, src(entries));
    const days = dayValues(d, s);
    const p = periodOf("W", 0, TODAY);
    const sum = summaryOf(d, p, colValues(d, p, s, days), s, days, TODAY);
    expect(sum.label).toBe("DURCHSCHNITT");
    expect(sum.value).toBe("400");
    // die Woche hat sechs abgeschlossene Tage, nur zwei davon mit Eintrag
    expect(sum.sub).toBe("an 2 Tagen mit Eintrag");
  });

  it("ohne Lücken steht kein Hinweis unter dem Durchschnitt", () => {
    const d = def("trinken");
    const entries = [1, 2, 3, 4, 5, 6].map((i) => e(addDays(TODAY, -i), "10:00", "trinken", { ml: 100 * i }));
    const s = samplesOf(d, src(entries));
    const days = dayValues(d, s);
    const p = periodOf("W", 0, TODAY);
    const sum = summaryOf(d, p, colValues(d, p, s, days), s, days, TODAY);
    expect(sum.value).toBe("350");
    expect(sum.sub).toBeUndefined();
  });

  it("nur heute: Durchschnitt mit Hinweis", () => {
    const d = def("trinken");
    const s = samplesOf(d, src([e(TODAY, "10:00", "trinken", { ml: 50 })]));
    const days = dayValues(d, s);
    const p = periodOf("W", 0, TODAY);
    const sum = summaryOf(d, p, colValues(d, p, s, days), s, days, TODAY);
    expect(sum.value).toBe("50");
    expect(sum.sub).toBe("nur heute, bis jetzt");
  });

  it("Atemzüge: Bereich und Median, gewählte Spalte zeigt den Tag", () => {
    const d = def("atem");
    const entries = [e(addDays(TODAY, -1), "07:00", "atem", { bpm: 30 }), e(TODAY, "07:00", "atem", { bpm: 34 }), e(TODAY, "22:00", "atem", { bpm: 38 })];
    const s = samplesOf(d, src(entries));
    const days = dayValues(d, s);
    const p = periodOf("W", 0, TODAY);
    const cols = colValues(d, p, s, days);
    const sum = summaryOf(d, p, cols, s, days, TODAY);
    expect(sum.label).toBe("BEREICH");
    expect(sum.value).toBe("30–38");
    expect(sum.sub).toBe("Median 34 · 3 Messungen");
    const sel = summaryOf(d, p, cols, s, days, TODAY, 6);
    expect(sel.value).toBe("34–38");
    expect(sel.when).toContain("10. Apr.");
  });

  it("ohne Werte: Keine Daten", () => {
    const d = def("spo2");
    const p = periodOf("W", 0, TODAY);
    const sum = summaryOf(d, p, colValues(d, p, [], new Map()), [], new Map(), TODAY);
    expect(sum.empty).toBe(true);
    expect(sum.value).toBe("Keine Daten");
  });

  it("Einheit in der Einzahl", () => {
    expect(unitFor(def("fotos"), "1")).toBe("Foto");
    expect(unitFor(def("fotos"), "2")).toBe("Fotos");
    expect(unitFor(def("trinken"), "1")).toBe("ml");
  });
});

describe("Achsen", () => {
  it("die Orientierungslinie liegt sichtbar in der Fläche, nicht auf dem Rand", () => {
    const d = def("atem");
    const s = samplesOf(d, src([e(TODAY, "07:00", "atem", { bpm: 41 }), e(TODAY, "12:00", "atem", { bpm: 64 })]));
    const days = dayValues(d, s);
    const p = periodOf("W", 0, TODAY);
    const sc = scaleFor(d, colValues(d, p, s, days));
    expect(sc.min).toBeLessThan(40);
    expect(sc.max).toBeGreaterThanOrEqual(64);
  });

  it("ohne Werte zeigt die Sättigung die Fläche um 95 %", () => {
    const d = def("spo2");
    const p = periodOf("W", 0, TODAY);
    const sc = scaleFor(d, colValues(d, p, [], new Map()));
    expect(sc.min).toBeLessThan(95);
    expect(sc.max).toBeGreaterThan(95);
    expect(sc.max).toBeLessThanOrEqual(100);
  });

  it("Säulen beginnen bei null", () => {
    const d = def("trinken");
    const s = samplesOf(d, src([e(TODAY, "07:00", "trinken", { ml: 430 })]));
    const p = periodOf("W", 0, TODAY);
    const sc = scaleFor(d, colValues(d, p, s, dayValues(d, s)));
    expect(sc.min).toBe(0);
    expect(sc.max).toBeGreaterThanOrEqual(430);
  });
});

describe("Tagesplan", () => {
  it("zählt heute nur Fälliges, Ausgelassenes gilt nicht als gegeben", () => {
    const checks: Check[] = [
      { day: "2030-04-03", slot: "ome", time: "07:05" },
      { day: "2030-04-03", slot: "pred", time: "08:10", skipped: true },
      { day: "2030-04-04", slot: "ome", time: "07:00" },
    ];
    const now = { day: "2030-04-04", minutes: 7 * 60 + 30, hm: "07:30", seconds: 0 };
    const m = planDays([OME, PRED], checks, "2030-04-03", now);
    expect(m.get("2030-04-03")).toEqual({ due: 2, given: 1 });
    // am 4. ist um 07:30 nur das Mittel um 07:00 fällig
    expect(m.get("2030-04-04")).toEqual({ due: 1, given: 1 });
  });
});

describe("Highlights", () => {
  const prevDays = [1, 2, 3].map((i) => addDays(TODAY, -i));
  const base = prevDays.flatMap((d) => [e(d, "08:00", "trinken", { ml: 100 }), e(d, "18:00", "trinken", { ml: 100 })]);

  it("heute bisher mehr getrunken als sonst um diese Zeit", () => {
    const entries = [...base, e(TODAY, "08:00", "trinken", { ml: 300 })];
    const hl = highlightsOf(src(entries), { day: TODAY, minutes: 10 * 60, hm: "10:00", seconds: 0 }, "trinken");
    expect(hl).toHaveLength(1);
    expect(hl[0].text).toContain("mehr getrunken");
    expect(hl[0].stats[0].value).toBe("300");
    expect(hl[0].stats[1].value).toBe("100");
    expect(hl[0].chart.kind).toBe("cum");
  });

  it("vor 9 Uhr und mit weniger als drei Vergleichstagen gibt es keinen Vergleich", () => {
    const entries = [...base, e(TODAY, "08:00", "trinken", { ml: 300 })];
    expect(highlightsOf(src(entries), { day: TODAY, minutes: 8 * 60, hm: "08:00", seconds: 0 }, "trinken")).toHaveLength(0);
    const few = base.filter((x) => x.day !== prevDays[2]);
    expect(highlightsOf(src([...few, e(TODAY, "08:00", "trinken", { ml: 300 })]), { day: TODAY, minutes: 12 * 60, hm: "12:00", seconds: 0 }, "trinken")).toHaveLength(0);
  });

  it("ohne Eintrag von heute gibt es keinen Vergleich (kein „weniger gefressen“ bei 0 g)", () => {
    const food = prevDays.flatMap((d) => [e(d, "09:00", "futter", { g: 150 }), e(d, "19:00", "futter", { g: 200 })]);
    expect(highlightsOf(src(food), { day: TODAY, minutes: 23 * 60 + 30, hm: "23:30", seconds: 0 }, "futter")).toHaveLength(0);
    const hl = highlightsOf(src([...food, e(TODAY, "09:00", "futter", { g: 100 })]), { day: TODAY, minutes: 12 * 60, hm: "12:00", seconds: 0 }, "futter");
    expect(hl).toHaveLength(1);
    expect(hl[0].text).toContain("weniger gefressen");
  });

  it("Gewicht: nur erster und letzter Tag beschriftet", () => {
    const entries = [e(addDays(TODAY, -10), "08:00", "gewicht", { kg: 17 }), e(TODAY, "08:00", "gewicht", { kg: 17.8 })];
    const hl = highlightsOf(src(entries), { day: TODAY, minutes: 12 * 60, hm: "12:00", seconds: 0 }, "gewicht");
    expect(hl).toHaveLength(1);
    expect(hl[0].text).toContain("gestiegen");
    const ch = hl[0].chart;
    expect(ch.kind).toBe("points");
    if (ch.kind === "points") expect(ch.labels.filter(Boolean)).toHaveLength(2);
  });
});

describe("Trends", () => {
  it("Kot: Mittelwerte mit einer Nachkommastelle", () => {
    const before = [8, 9, 10, 11].map((i) => e(addDays(TODAY, -i), "08:00", "kot", { form: "fest" }));
    const recent = [1, 2, 3, 4].flatMap((i) => [e(addDays(TODAY, -i), "08:00", "kot", { form: "fest" }), ...(i < 3 ? [e(addDays(TODAY, -i), "18:00", "kot", { form: "fest" })] : [])]);
    const t = trendOf("kot", src([...before, ...recent]), TODAY);
    expect(t && t !== "zu wenig" ? t.text : "").toContain("1,5");
  });

  it("braucht vier Tage je Woche", () => {
    const entries = [1, 2, 3].map((i) => e(addDays(TODAY, -i), "07:00", "atem", { bpm: 30 }));
    expect(trendOf("atem", src(entries), TODAY)).toBe("zu wenig");
  });

  it("erkennt einen deutlichen Anstieg und bleibt bei kleinen Änderungen still", () => {
    const before = [8, 9, 10, 11, 12].map((i) => e(addDays(TODAY, -i), "07:00", "atem", { bpm: 30 }));
    const up = [1, 2, 3, 4, 5].map((i) => e(addDays(TODAY, -i), "07:00", "atem", { bpm: 40 }));
    const t = trendOf("atem", src([...before, ...up]), TODAY);
    expect(t && t !== "zu wenig" ? t.dir : null).toBe("up");
    const flat = [1, 2, 3, 4, 5].map((i) => e(addDays(TODAY, -i), "07:00", "atem", { bpm: 31 }));
    expect(trendOf("atem", src([...before, ...flat]), TODAY)).toBeNull();
  });
});
