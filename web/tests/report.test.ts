import { describe, expect, it } from "vitest";
import { clinicReport, type ClinicReportData } from "../src/lib/report";
import type { Entry } from "@shared/types.ts";
import { ATEM, OME, PRED } from "./fixtures";

function atem(day: string, time: string, bpm: number, extra: Record<string, unknown> = {}): Entry {
  return { id: `${day}-${time}`, type: "atem", day, time, data: { bpm, zustand: "ruhig", ...extra }, slot: null, ack: true } as Entry;
}

const base: ClinicReportData = {
  regimens: [PRED, OME, ATEM],
  checks: [
    { day: "2030-04-11", slot: "pred", time: "08:05" },
    { day: "2030-04-12", slot: "pred", time: "08:10" },
    { day: "2030-04-11", slot: "ome", time: "07:00" },
  ],
  entries: [
    atem("2030-03-30", "22:00", 52),
    atem("2030-04-01", "22:00", 48, { lage: "links" }),
    atem("2030-04-11", "07:30", 36, { lage: "links" }),
    atem("2030-04-11", "22:30", 30, { lage: "rechts", zustand: "schlaeft" }),
    atem("2030-04-12", "07:30", 34, { lage: "links" }),
    { id: "e1", type: "erbrechen", day: "2030-04-12", time: "09:00", data: { inhalt: "Futter" }, slot: null, ack: true } as Entry,
  ],
  photos: [],
  days: [{ day: "2030-04-11", nacht: "ruhig" }],
  members: [],
  profile: { id: 1, data: { name: "Testhund", allergies: [{ source: "Test", items: ["Pute"] }], problems: [{ id: "p1", title: "Testproblem", status: "aktiv" }] } },
  questions: [
    { id: "q1", text: "Wann Kontrolle?", sort: 1, status: "offen", answer: null },
    { id: "q2", text: "Schon erledigt", sort: 2, status: "geklaert", answer: "ja" },
  ],
};

describe("clinicReport", () => {
  const now = { day: "2030-04-12", hm: "12:00" };
  const text = clinicReport(base, "2030-04-11", "2030-04-12", now);

  it("nennt Kopf, Unverträglichkeiten und Zeitraum", () => {
    expect(text.split("\n")[0]).toBe("Testhund – Verlaufsbericht 11.04.2030 bis 12.04.2030 (heute bis 12:00 Uhr)");
    expect(text).toContain("Unverträglichkeiten laut Test: Pute");
    expect(text).not.toContain("Bekannte Probleme");
  });

  it("zeigt Dosisstufen und abgehakte Gaben", () => {
    expect(text).toContain("- Testmittel: 20 mg ab 11.04., 15 mg ab 12.04. – 2 von 2 Gaben abgehakt");
    // Magentest: 11.04. abgehakt, 12.04. um 07:00 fällig und offen
    expect(text).toContain("- Magentest 20 mg – 1 von 2 Gaben abgehakt; nicht abgehakt: 12.04. 07:00");
  });

  it("fasst Atemzüge zusammen und vergleicht mit der Zeit vor Therapiebeginn", () => {
    expect(text).toContain("Atemzüge pro Minute in Ruhe");
    expect(text).toContain("- Do, 11.04.: 33 (30–36, 2 Zählungen)");
    expect(text).toContain("nach Liegeseite (Median): links liegend 35 (2×), rechts liegend 30 (1×)");
    expect(text).toContain("zum Vergleich vor Therapiebeginn (30.03.–01.04.): Median 50 (48–52, 2 Zählungen)");
  });

  it("listet Auffälligkeiten, Nacht und nur offene Fragen", () => {
    expect(text).toContain("Auffälligkeiten");
    expect(text).toMatch(/12\.04\. 09:00 Erbrechen/);
    expect(text).toContain("- 11.04.: Nacht ruhig");
    expect(text).toContain("1. Wann Kontrolle?");
    expect(text).not.toContain("Schon erledigt");
  });

  it("berücksichtigt die Optionen", () => {
    const t2 = clinicReport(base, "2030-04-11", "2030-04-12", now, { problems: true, questions: false });
    expect(t2).toContain("Bekannte Probleme\n1. Testproblem\n   Stand: aktiv");
    expect(t2).not.toContain("Offene Fragen");
  });
});

describe("clinicReport – Sonderfälle", () => {
  const now = { day: "2030-04-30", hm: "12:00" };

  it("nennt alle Gruppen von Unverträglichkeiten", () => {
    const d: ClinicReportData = { ...base, profile: { id: 1, data: { name: "Testhund", allergies: [{ source: "Allergietest", items: ["Pute", "Rind"] }, { source: "Klinik", items: ["Metamizol"] }] } } };
    const t = clinicReport(d, "2030-04-28", "2030-04-30", now);
    expect(t).toContain("Unverträglichkeiten laut Allergietest: Pute, Rind");
    expect(t).toContain("Unverträglichkeiten laut Klinik: Metamizol");
  });

  it("führt pausierte Mittel mit abgehakten Gaben auf", () => {
    const d: ClinicReportData = { ...base, regimens: [{ ...PRED, active: false }], checks: [{ day: "2030-04-11", slot: "pred", time: "08:00" }, { day: "2030-04-12", slot: "pred", time: "08:00" }] };
    const t = clinicReport(d, "2030-04-10", "2030-04-14", { day: "2030-04-14", hm: "12:00" });
    expect(t).toContain("- Testmittel: 20 mg ab 11.04., 15 mg ab 12.04. – derzeit pausiert; im Zeitraum 2 Gaben abgehakt");
  });

  it("rechnet Durchschnitte ohne den laufenden Tag", () => {
    const drink = (day: string, ml: number): Entry => ({ id: `t-${day}`, type: "trinken", day, time: "10:00", data: { ml, weg: "spritze" }, slot: null, ack: true }) as Entry;
    const d: ClinicReportData = { ...base, regimens: [], entries: [drink("2030-04-28", 600), drink("2030-04-29", 600), drink("2030-04-30", 100)] };
    const t = clinicReport(d, "2030-04-28", "2030-04-30", now);
    expect(t).toContain("- Trinken Ø 600 ml pro Tag (2 abgeschlossene Tage mit Angabe): 28.04. 600 ml · 29.04. 600 ml · 30.04. 100 ml (bis jetzt)");
    const onlyToday = clinicReport({ ...d, entries: [drink("2030-04-30", 100)] }, "2030-04-30", "2030-04-30", now);
    expect(onlyToday).toContain("- Trinken heute bis 12:00 Uhr: 100 ml");
  });

  it("ordnet Beobachtungen zeitlich und behält die jüngsten", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ day: `2030-04-${String(i + 1).padStart(2, "0")}`, nacht: "ruhig" }));
    const note = (day: string, text: string): Entry => ({ id: `n-${day}`, type: "notiz", day, time: "21:00", data: { text }, slot: null, ack: true }) as Entry;
    const d: ClinicReportData = { ...base, regimens: [], entries: [note("2030-04-29", "Zahnfleisch blass"), note("2030-04-30", "hustet nachts stärker")], days };
    const t = clinicReport(d, "2030-04-01", "2030-04-30", now);
    expect(t).toContain("Zahnfleisch blass");
    expect(t).toContain("hustet nachts stärker");
    expect(t).toContain("ältere nicht aufgeführt");
  });
  it("trennt ausgelassene von vergessenen Gaben", () => {
    const d: ClinicReportData = { ...base, checks: [{ day: "2030-04-11", slot: "ome", time: "07:00" }, { day: "2030-04-12", slot: "ome", time: "07:20", skipped: true }] };
    const t = clinicReport(d, "2030-04-11", "2030-04-12", now);
    expect(t).toContain("- Magentest 20 mg – 1 von 2 Gaben abgehakt; bewusst ausgelassen: 12.04. 07:00");
  });

  it("schreibt Beobachtungen ohne Schlagwort ohne leeren Strich", () => {
    const note: Entry = { id: "n1", type: "notiz", day: "2030-04-12", time: "10:00", data: { text: "erster Versuch mit dem Spray" }, slot: null, ack: true } as Entry;
    const t = clinicReport({ ...base, entries: [note] }, "2030-04-11", "2030-04-12", now);
    expect(t).toContain("- 12.04. 10:00: erster Versuch mit dem Spray");
    expect(t).not.toContain(":  –");
  });

  it("nennt selbst getrunkene Mengen", () => {
    const drink = (time: string, ml: number, weg: string): Entry => ({ id: `t-${time}`, type: "trinken", day: "2030-04-30", time, data: { ml, weg }, slot: null, ack: true }) as Entry;
    const t = clinicReport({ ...base, regimens: [], entries: [drink("09:00", 80, "spritze"), drink("10:40", 100, "selbst")] }, "2030-04-30", "2030-04-30", now);
    expect(t).toContain("- Trinken heute bis 12:00 Uhr: 180 ml, davon 100 ml selbst");
  });
});
