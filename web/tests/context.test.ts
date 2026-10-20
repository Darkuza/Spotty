import { describe, expect, it } from "vitest";
import { buildContext, SYSTEM_RULES, type ContextData } from "@shared/contextText.ts";
import { ATEM, PRED } from "./fixtures";

const data: ContextData = {
  profile: { id: 1, data: { name: "Testhund", species: "Hund", born: "2017-03-11", owner: "Testperson", family: "Testfamilie", guiding_principle: "Testleitlinie", problems: [{ id: "p1", title: "Testproblem" }] } },
  regimens: [PRED, ATEM],
  documents: [{ id: "d1", title: "Testbefund", doc_date: "2030-03-27", issuer: "Testklinik", kind: "befund", summary: "Zusammenfassung", findings: [{ label: "Magen", text: "verdickt", level: "warn" }], files: [], status: "ok" }],
  labs: [{ id: "l1", document_id: "d1", date: "2030-03-26", grp: "Hämatologie", param: "Hämatokrit", code: "HCT", value: 48.1, value_text: null, unit: "%", ref_low: 37.3, ref_high: 61.7, flag: null, device: null, note: null }],
  events: [{ id: "ev1", date: "2030-04-01", time: null, title: "Testereignis", text: null, category: "klinik", document_id: null }],
  questions: [{ id: "q1", text: "Testfrage?", sort: 1, status: "offen", answer: null }],
  entries: [{ id: "e1", day: "2030-04-03", time: "07:30", type: "atem", data: { bpm: 44, zustand: "schlaeft" }, slot: "af1" }],
  checks: [{ day: "2030-04-03", slot: "pred", time: "08:05", created_by: "u1" }],
  days: [],
  photos: [],
  members: [{ user_id: "u1", email: "a@example.org", name: "Testnutzer", role: "admin" }],
};

describe("Wissensstand für Claude", () => {
  const ctx = buildContext(data, "2030-04-03", "09:00");

  it("enthält Akte, Labor, Plan und Protokoll", () => {
    expect(ctx.static).toContain("Testhund");
    expect(ctx.static).toContain("Testfamilie");
    expect(ctx.static).toContain("Testbefund");
    expect(ctx.static).toContain("Hämatokrit");
    expect(ctx.static).toContain("Testleitlinie");
    expect(ctx.dynamic).toContain("Testmittel 20 mg");
    expect(ctx.dynamic).toContain("44");
    expect(ctx.dynamic).toContain("Testfrage?");
  });

  it("die festen Regeln verweisen auf die Akte statt auf Personen", () => {
    expect(SYSTEM_RULES).toContain("steht in der Akte");
  });
});
