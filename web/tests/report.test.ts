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
    expect(t2).toContain("Bekannte Probleme\n1. Testproblem (aktiv)");
    expect(t2).not.toContain("Offene Fragen");
  });
});
