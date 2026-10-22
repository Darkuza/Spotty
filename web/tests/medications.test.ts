import { describe, expect, it } from "vitest";
import { buildMedications, doseInfo, findMedication, listDe, matchSubstances, parseDose, planNames, planState, rowSub, sectionsOf, snippetAround, substanceOfRegimen, tokensOf, whenText } from "../src/lib/medications";
import { SUBSTANCES } from "../src/features/medications/catalog";
import { STRUCTURES } from "../src/features/medications/structures.generated";
import { photoFiles } from "../src/features/medications/photos";
import type { Check, Entry, Question, Regimen, TimelineEvent } from "@shared/types.ts";

// Erfundene Testdaten (keine echten Angaben); „heute“ ist der 15. Mai 2030.
const TODAY = "2030-05-15";

const base = { slots: [], steps: [], active: true, notify: true, sort: 0 };
const reg = (r: Partial<Regimen> & Pick<Regimen, "id" | "name" | "category">): Regimen => ({ ...base, ...r });

const ome = reg({
  id: "ome",
  name: "Omeprazol",
  category: "med",
  sort: 1,
  slots: [
    { key: "ome1", time: "07:00" },
    { key: "ome2", time: "19:00" },
  ],
  steps: [{ from: "2030-05-01", to: null, dose: "10 mg", label: "½ Tablette" }],
});
const pred = reg({
  id: "pred",
  name: "Prednisolon",
  category: "med",
  sort: 2,
  slots: [{ key: "pred1", time: "08:00" }],
  steps: [
    { from: "2030-05-01", to: "2030-05-10", dose: "20 mg", label: "1 Tablette" },
    { from: "2030-05-11", to: "2030-05-24", dose: "15 mg", label: "¾ Tablette" },
    { from: "2030-05-25", to: "2030-06-07", dose: "10 mg", label: "½ Tablette" },
  ],
});
const sole = reg({ id: "sole", name: "Inhalation Sole", category: "inh", sort: 3, slots: [{ key: "sole1", time: "09:00" }], steps: [{ from: "2030-05-01", to: null }] });
const spray = reg({ id: "spray", name: "Dosierspray", category: "inh", purpose: "Atemwege (Salmeterol und Fluticason)", sort: 4, slots: [{ key: "spray1", time: "09:15" }, { key: "spray2", time: "20:15" }], steps: [] });
const sucra = reg({ id: "sucra", name: "Sucrabest", category: "med", sort: 5, slots: [{ key: "s1", time: "10:00" }, { key: "s2", time: "15:00" }, { key: "s3", time: "21:00" }], steps: [{ from: "2030-05-01", to: null, dose: "¾ Beutel" }] });
const ended = reg({ id: "alt", name: "Dexamethason", category: "med", sort: 6, slots: [{ key: "d1", time: "08:00" }], steps: [{ from: "2030-04-01", to: "2030-04-10", dose: "1 mg" }] });
const paused = reg({ id: "pause", name: "Maropitant", category: "med", sort: 7, active: false, slots: [{ key: "m1", time: "08:00" }], steps: [{ from: "2030-04-01", to: null, dose: "10 mg" }] });
const food = reg({ id: "food", name: "Mahlzeit", category: "feed", slots: [{ key: "f1", time: "12:00" }], steps: [{ from: "2030-05-01", to: null }] });
const own = reg({ id: "xyz", name: "Testtropfen", category: "med", sort: 8, slots: [{ key: "t1", time: "12:00" }], steps: [{ from: "2030-05-01", to: null, dose: "5 Tropfen" }] });

const entry = (day: string, name: string, extra: Partial<Entry> = {}): Entry => ({ id: `${day}-${name}`, day, time: "12:00", type: "med", data: { name }, ...extra });
const event = (id: string, date: string, title: string, text: string | null, category: string, document_id: string | null = null): TimelineEvent => ({ id, date, time: null, title, text, category, document_id });
const question = (id: string, text: string, status: Question["status"] = "offen", answer: string | null = null): Question => ({ id, text, sort: 0, status, answer, created_at: "2030-05-02T10:00:00Z" });
const check = (day: string, slot: string, skipped = false): Check => ({ day, slot, time: "08:00", skipped });

describe("Wörter und Namen finden", () => {
  it("zerlegt Text ohne Umlautpunkte und Sonderzeichen", () => {
    expect(tokensOf("Kochsalzlösung 0,9 % – Größe")).toEqual(["kochsalzlosung", "0", "9", "grosse"]);
  });

  it("findet Wirkstoffe, Handelsnamen und Kürzel", () => {
    expect(matchSubstances("Omeprazol 20 mg")[0].substance.id).toBe("omeprazol");
    expect(matchSubstances("Omeprazol-ratiopharm")[0].substance.id).toBe("omeprazol");
    expect(matchSubstances("Novalgin 500")[0].substance.id).toBe("metamizol");
    expect(matchSubstances("Sucrabest Beutel")[0].substance.id).toBe("sucralfat");
    expect(matchSubstances("MCP AL 10 (Metoclopramid 10 mg)").map((h) => h.substance.id)).toEqual(["metoclopramid"]);
    expect(matchSubstances("Emser Sole")[0].substance.id).toBe("natriumchlorid");
    expect(matchSubstances("Kochsalzlösung 0,9 %")[0].substance.id).toBe("natriumchlorid");
    expect(matchSubstances("Dauertropf Sterofundin ISO")[0].substance.id).toBe("sterofundin");
  });

  it("kurze Namen müssen genau stimmen", () => {
    expect(matchSubstances("Solebad")).toEqual([]);
    expect(matchSubstances("MCPX")).toEqual([]);
    expect(matchSubstances("Dexamethason")[0].substance.id).toBe("dexamethason");
    expect(matchSubstances("Dexa 1 mg")[0].substance.id).toBe("dexamethason");
  });

  it("Oberbegriffe und vermutete Schreibweisen sind Vermutungen", () => {
    const cortison = matchSubstances("Cortison-Injektion");
    expect(cortison.map((h) => h.substance.id).sort()).toEqual(["dexamethason", "prednisolon"]);
    expect(cortison.every((h) => h.guess)).toBe(true);
    const milben = matchSubstances("Entwurmung mit „Milbenin“");
    expect(milben).toHaveLength(1);
    expect(milben[0]).toMatchObject({ guess: true });
    expect(milben[0].substance.id).toBe("milbemycinoxim-praziquantel");
  });

  it("ein genauer Treffer verdrängt die Vermutung", () => {
    const hits = matchSubstances("Cortison, wohl Dexamethason");
    expect(hits.find((h) => h.substance.id === "dexamethason")?.guess).toBe(false);
    expect(hits.find((h) => h.substance.id === "prednisolon")?.guess).toBe(true);
  });

  it("sortiert nach der Stelle im Text", () => {
    expect(matchSubstances("erst Metamizol, dann Omeprazol").map((h) => h.substance.id)).toEqual(["metamizol", "omeprazol"]);
  });

  it("jeder Katalogeintrag ist über seinen Namen auffindbar und hat Strukturen", () => {
    for (const s of SUBSTANCES) {
      expect(s.aliases.length, s.id).toBeGreaterThan(0);
      for (const a of s.aliases) expect(matchSubstances(a).some((h) => h.substance.id === s.id && !h.guess), `${s.id}: ${a}`).toBe(true);
      expect(s.know.length, s.id).toBeLessThanOrEqual(3);
      expect(s.how.length, s.id).toBe(3);
      expect(s.molecules.length, s.id).toBeGreaterThan(0);
      for (const m of s.molecules) expect(STRUCTURES[m.id], `${s.id}: ${m.id}`).toBeTruthy();
      expect(s.sources.length, s.id).toBeGreaterThan(0);
      for (const src of s.sources) expect(src.url, s.id).toMatch(/^https:\/\//);
    }
    expect(new Set(SUBSTANCES.map((s) => s.id)).size).toBe(SUBSTANCES.length);
  });

  it("Fotos liegen im Projekt und nennen Urheber, Lizenz und Quelle", () => {
    const files = photoFiles();
    const used = new Set<string>();
    for (const s of SUBSTANCES) {
      if (!s.photo) continue;
      const p = s.photo;
      expect(files, `${s.id}: Datei ${p.file} fehlt in src/assets/medications`).toContain(p.file);
      used.add(p.file);
      expect(p.alt.length, s.id).toBeGreaterThan(10);
      expect(p.caption.length, s.id).toBeGreaterThan(10);
      expect(p.author.length, s.id).toBeGreaterThan(1);
      expect(p.url, s.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      if (p.license.startsWith("CC")) expect(p.licenseUrl, `${s.id}: Link zur Lizenz`).toMatch(/^https:\/\/creativecommons\.org\//);
      if (/^CC BY/.test(p.license)) expect(p.changes, `${s.id}: Bearbeitung angeben`).toBeTruthy();
      expect(p.license, s.id).toMatch(/^(CC0|CC BY( 4\.0)?|CC BY-SA 4\.0|gemeinfrei)$/);
    }
    for (const f of files) expect(used.has(f), `${f} wird in keinem Wirkstoff verwendet`).toBe(true);
  });

  it("Aliasnamen gehören genau einem Wirkstoff", () => {
    const seen = new Map<string, string>();
    for (const s of SUBSTANCES) {
      for (const a of [...s.aliases, ...(s.similar || [])].filter((x) => !(s.similar || []).includes(x))) {
        const key = tokensOf(a).join(" ");
        expect(seen.get(key) ?? s.id, `${a} gehört zu ${seen.get(key)} und ${s.id}`).toBe(s.id);
        seen.set(key, s.id);
      }
    }
  });

  it("Ausschnitt beginnt am Satzanfang und endet an Wortgrenzen", () => {
    const text = "Aufnahme am Montag. Danach Metamizol 30 mg/kg i.v. und Maropitant, später Entlassung mit weiterem Verlauf und vielen Hinweisen für zu Hause, die hier nicht mehr stehen sollen.";
    const at = text.indexOf("Metamizol");
    const s = snippetAround(text, at, 70);
    expect(s.startsWith("Danach Metamizol")).toBe(true);
    expect(s.endsWith(" …")).toBe(true);
    expect(s).not.toMatch(/\S…$/);
    expect(snippetAround("Kurz Omeprazol.", 5)).toBe("Kurz Omeprazol.");
  });
});

describe("Pläne", () => {
  it("liest den Wirkstoff aus Name oder Zweck", () => {
    expect(substanceOfRegimen(sole)?.id).toBe("natriumchlorid");
    expect(substanceOfRegimen(spray)?.id).toBe("salmeterol-fluticason");
    expect(substanceOfRegimen(sucra)?.id).toBe("sucralfat");
    expect(substanceOfRegimen(own)).toBeNull();
    expect(substanceOfRegimen(reg({ id: "x", name: "Magenschutz", category: "med", purpose: "Omeprazol morgens" }))?.id).toBe("omeprazol");
  });

  it("ein Oberbegriff genügt nicht für die Zuordnung", () => {
    expect(substanceOfRegimen(reg({ id: "c", name: "Cortison", category: "med" }))).toBeNull();
  });

  it("bestimmt den Stand eines Plans", () => {
    expect(planState(ome, TODAY)).toBe("aktuell");
    expect(planState(pred, TODAY)).toBe("aktuell");
    expect(planState(spray, TODAY)).toBe("geplant");
    expect(planState(ended, TODAY)).toBe("frueher");
    expect(planState(paused, TODAY)).toBe("frueher");
    expect(planState({ ...pred, steps: [{ from: "2030-06-01", to: null, dose: "5 mg" }] }, TODAY)).toBe("geplant");
    // jeder zweite Tag: an einem freien Tag bleibt der Plan aktuell
    const alt = reg({ id: "a", name: "Omeprazol", category: "med", slots: [{ key: "a", time: "07:00" }], steps: [{ from: "2030-05-01", to: null, dose: "20 mg", pattern: "alternate", anchor: "2030-05-01" }] });
    expect(planState(alt, "2030-05-16")).toBe("aktuell");
  });
});

describe("Dosis aus dem Plan", () => {
  it("liest Zahl und Einheit", () => {
    expect(parseDose("20 mg")).toEqual({ value: 20, unit: "mg" });
    expect(parseDose("10mg")).toEqual({ value: 10, unit: "mg" });
    expect(parseDose("¾ Beutel")).toEqual({ value: 0.75, unit: "Beutel" });
    expect(parseDose("1,5 ml")).toEqual({ value: 1.5, unit: "ml" });
    expect(parseDose("2x10 mg")).toBeNull();
    expect(parseDose("15 mg + 5 mg")).toBeNull();
    expect(parseDose("")).toBeNull();
    expect(parseDose(null)).toBeNull();
  });

  it("zwei Gaben am Tag: 2 × 10 mg und die Tagessumme", () => {
    const d = doseInfo(ome, TODAY);
    expect(d.headline).toBe("2 × 10 mg täglich");
    expect(d.total).toBe("zusammen 20 mg am Tag");
    expect(d.times).toBe("07:00 und 19:00 Uhr");
    expect(d.hint).toBe("½ Tablette");
    expect(d.today).toBeNull();
    expect(d.next).toBeNull();
  });

  it("eine Gabe: Dosis ohne Summe, mit nächster Stufe", () => {
    const d = doseInfo(pred, TODAY);
    expect(d.headline).toBe("15 mg täglich");
    expect(d.total).toBeNull();
    expect(d.hint).toBe("¾ Tablette");
    expect(d.next).toBe("Ab 25. Mai: 10 mg");
  });

  it("Beutel werden als Bruch gerechnet", () => {
    const d = doseInfo(sucra, TODAY);
    expect(d.headline).toBe("3 × ¾ Beutel täglich");
    expect(d.total).toBe("zusammen 2 ¼ Beutel am Tag");
    expect(d.times).toBe("10:00, 15:00 und 21:00 Uhr");
  });

  it("jeder zweite Tag und feste Wochentage", () => {
    const alt = reg({ id: "a", name: "Omeprazol", category: "med", slots: [{ key: "a", time: "07:00" }], steps: [{ from: "2030-05-01", to: "2030-05-31", dose: "20 mg", label: "jeden zweiten Tag · 1 Tablette", pattern: "alternate", anchor: "2030-05-01" }] });
    const d = doseInfo(alt, TODAY);
    expect(d.headline).toBe("20 mg jeden zweiten Tag");
    expect(d.hint).toBe("");
    expect(d.today).toBeNull(); // 1., 3., … 15. Mai sind Gabetage
    expect(doseInfo(alt, "2030-05-16").today).toBe("Heute nicht dran");
    expect(d.next).toBe("Läuft bis 31. Mai");
    const wd = reg({ id: "w", name: "Prednisolon", category: "med", slots: [{ key: "w", time: "08:00" }], steps: [{ from: "2030-05-01", to: null, dose: "5 mg", pattern: "weekdays", weekdays: [1, 3, 5] }] });
    expect(doseInfo(wd, TODAY).headline).toBe("5 mg an Mo, Mi, Fr");
  });

  it("ohne Dosis und mit nicht lesbarer Dosis", () => {
    expect(doseInfo(sole, TODAY).headline).toBe("Täglich");
    const twice = reg({ id: "t", name: "Inhalation", category: "inh", slots: [{ key: "t1", time: "09:00" }, { key: "t2", time: "20:00" }], steps: [{ from: "2030-05-01", to: null }] });
    expect(doseInfo(twice, TODAY)).toMatchObject({ headline: "2 × täglich", total: null });
    expect(doseInfo({ ...twice, steps: [{ from: "2030-06-01", to: null }] }, TODAY).headline).toBe("Ab 1. Juni: 2 × täglich");
    expect(doseInfo({ ...twice, slots: [twice.slots[0]], steps: [{ from: "2030-05-01", to: null, pattern: "weekdays", weekdays: [2, 4] }] }, TODAY).headline).toBe("An Di, Do");
    const odd = reg({ id: "o", name: "Omeprazol", category: "med", slots: [{ key: "a", time: "07:00" }, { key: "b", time: "19:00" }], steps: [{ from: "2030-05-01", to: null, dose: "2x10 mg" }] });
    const d = doseInfo(odd, TODAY);
    expect(d.headline).toBe("2 × 2x10 mg täglich");
    expect(d.total).toBeNull();
  });

  it("noch nicht begonnen, ab Datum, beendet, pausiert", () => {
    expect(doseInfo(spray, TODAY)).toMatchObject({ headline: "Noch nicht begonnen", times: "09:15 und 20:15 Uhr" });
    expect(doseInfo({ ...pred, steps: [{ from: "2030-06-01", to: null, dose: "5 mg" }] }, TODAY).headline).toBe("Ab 1. Juni: 5 mg täglich");
    expect(doseInfo(ended, TODAY).headline).toBe("Plan beendet am 10. Apr.");
    expect(doseInfo(paused, TODAY).headline).toBe("Pausiert");
  });

  it("Aufzählung auf Deutsch", () => {
    expect(listDe(["a"])).toBe("a");
    expect(listDe(["a", "b"])).toBe("a und b");
    expect(listDe(["a", "b", "c"])).toBe("a, b und c");
  });
});

describe("Liste aus Plan, Einträgen, Chronik und Fragen", () => {
  const inp = {
    regimens: [ome, pred, sole, spray, sucra, ended, paused, food, own],
    entries: [
      entry("2030-05-08", "Metamizol 500 mg"),
      entry("2030-05-09", "Metamizol 500 mg"),
      entry("2030-05-10", "Metamizol 500 mg", { time: "20:00" }),
      entry("2030-05-12", "MCP AL 10 (Metoclopramid 10 mg)"),
      entry("2030-05-13", "Metomotyl 5 mg"),
      entry("2030-05-14", "Testsaft 3 ml"),
      entry("2030-05-14", "Testsaft 5 ml"),
      entry("2030-05-14", "nicht bezeichnet"),
      entry("2030-05-14", ""),
      { ...entry("2030-05-14", "Gewicht"), type: "gewicht" as const },
    ],
    events: [
      event("e1", "2030-05-07", "Notdienst", "Aufnahme am Abend. Maropitant und Metamizol i.v., außerdem Dauertropf Sterofundin ISO. Weitere Untersuchung folgt.", "therapie", "d1"),
      event("e2", "2030-05-03", "Kotbefund", "Würmer nachgewiesen. Milbemax oder Advocate kämen in Frage.", "diagnostik"),
      event("e3", "2030-04-02", "Entwurmung mit „Milbenin“", null, "therapie"),
      event("e4", "2030-05-11", "Spritze", "Cortison-Injektion, Präparat unbekannt.", "klinik"),
      event("e5", "2030-04-20", "Spritze", "Wohl Dexamethason.", "klinik"),
      event("e6", "2030-05-05", "Besprechung", "Die Ärztin hält Cortison für aussichtsreicher.", "diagnostik"),
    ],
    questions: [
      question("q1", "Ist Pimobendan angezeigt?"),
      question("q2", "Welche Stärke hat das Dosierspray?", "geklaert", "Salmeterol und Fluticason, 50/250 µg."),
      question("q3", "Welches Cortison-Präparat wurde gespritzt?"),
    ],
    checks: [check("2030-05-14", "ome1"), check("2030-05-14", "ome2", true), check("2030-05-15", "pred1"), check("2030-05-13", "sole1")],
    today: TODAY,
  };
  const items = buildMedications(inp);
  const byKey = (k: string) => items.find((i) => i.key === k)!;

  it("aktuell sind nur Pläne mit heutiger Stufe", () => {
    expect(items.filter((i) => i.status === "aktuell").map((i) => i.key)).toEqual(["omeprazol", "prednisolon", "natriumchlorid", "sucralfat", "r-xyz"]);
  });

  it("Name wie im Plan, Wirkstoff aus dem Katalog", () => {
    expect(byKey("sucralfat").name).toBe("Sucrabest");
    expect(byKey("sucralfat").substance?.name).toBe("Sucralfat");
    expect(byKey("natriumchlorid").name).toBe("Inhalation Sole");
    expect(byKey("metamizol").name).toBe("Metamizol");
  });

  it("geplant: Plan ohne Stufen", () => {
    expect(byKey("salmeterol-fluticason").status).toBe("geplant");
    expect(byKey("salmeterol-fluticason").lastGiven).toBeNull();
  });

  it("früher: beendet, pausiert oder nur in Einträgen und Behandlungen", () => {
    expect(byKey("dexamethason").status).toBe("frueher");
    expect(byKey("maropitant").status).toBe("frueher");
    expect(byKey("maropitant").paused).toBe(true);
    expect(byKey("metamizol").status).toBe("frueher");
    expect(byKey("metoclopramid").status).toBe("frueher");
    expect(byKey("sterofundin").status).toBe("frueher");
  });

  it("möglich: nur erwähnt oder gefragt", () => {
    expect(byKey("pimobendan").status).toBe("moeglich");
    expect(byKey("imidacloprid-moxidectin").status).toBe("moeglich");
    expect(byKey("pimobendan").evidence[0]).toMatchObject({ kind: "frage", state: "offen", given: false });
  });

  it("vermutete Schreibweise: früher, aber als Vermutung gekennzeichnet", () => {
    const m = byKey("milbemycinoxim-praziquantel");
    expect(m.status).toBe("frueher");
    expect(m.guess).toBe(true);
    expect(m.evidence.find((e) => e.eventId === "e3")).toMatchObject({ guess: true, given: true });
    expect(m.evidence.find((e) => e.eventId === "e2")).toMatchObject({ guess: false, given: false });
    expect(rowSub(m, TODAY)).toContain("Zuordnung vermutet");
  });

  it("ein genauer Beleg macht die Zuordnung sicher", () => {
    const d = byKey("dexamethason");
    expect(d.guess).toBe(false);
    expect(d.evidence.map((e) => e.eventId)).toEqual(["e4", "e5"]);
    expect(d.evidence[0].guess).toBe(true);
  });

  it("Oberbegriffe in Gesprächen und Fragen bleiben ohne Zuordnung", () => {
    expect(byKey("prednisolon").evidence.some((e) => e.eventId === "e6" || e.key === "q-q3")).toBe(false);
    expect(byKey("dexamethason").evidence.some((e) => e.eventId === "e6" || e.key === "q-q3")).toBe(false);
  });

  it("eine beantwortete Frage zählt mit Antwort zum Wirkstoff", () => {
    const sp = byKey("salmeterol-fluticason");
    expect(sp.evidence.find((e) => e.key === "q-q2")).toMatchObject({ kind: "frage", state: "geklaert" });
  });

  it("fasst Einträge je Name zusammen", () => {
    const m = byKey("metamizol");
    const en = m.evidence.filter((e) => e.kind === "eintrag");
    expect(en).toHaveLength(1);
    expect(en[0]).toMatchObject({ title: "Metamizol 500 mg", day: "2030-05-08", until: "2030-05-10", count: 3, given: true });
    expect(m.lastGiven).toBe("2030-05-10");
    const mc = byKey("metoclopramid").evidence.filter((e) => e.kind === "eintrag");
    expect(mc.map((e) => e.title).sort()).toEqual(["MCP AL 10 (Metoclopramid 10 mg)", "Metomotyl 5 mg"]);
  });

  it("zeigt im Ereignis den Satz mit dem Wirkstoff", () => {
    const e = byKey("maropitant").evidence.find((x) => x.eventId === "e1")!;
    expect(e.text).toContain("Maropitant und Metamizol");
    expect(e.text).not.toContain("Weitere Untersuchung");
    expect(e.documentId).toBe("d1");
    expect(byKey("milbemycinoxim-praziquantel").evidence.find((x) => x.eventId === "e3")!.text).toBeUndefined();
  });

  it("Häkchen setzen die letzte Gabe, ausgelassene nicht", () => {
    expect(byKey("omeprazol").lastGiven).toBe("2030-05-14");
    expect(byKey("prednisolon").lastGiven).toBe("2030-05-15");
    expect(byKey("natriumchlorid").lastGiven).toBe("2030-05-13");
  });

  it("Mittel ohne Katalogeintrag bekommen eine eigene Zeile", () => {
    expect(byKey("r-xyz")).toMatchObject({ name: "Testtropfen", substance: null, status: "aktuell" });
    const saft = byKey("e-testsaft");
    expect(saft).toMatchObject({ name: "Testsaft", substance: null, status: "frueher" });
    expect(saft.evidence).toHaveLength(2);
    expect(items.some((i) => /bezeichnet|gewicht|mahlzeit/i.test(i.name))).toBe(false);
  });

  it("Eintrag und Plan gleichen Namens landen in einer Zeile", () => {
    const merged = buildMedications({ regimens: [own], entries: [entry("2030-05-14", "Testtropfen 5 Tropfen")], events: [], questions: [], checks: [], today: TODAY });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ key: "r-xyz", status: "aktuell" });
    expect(merged[0].evidence).toHaveLength(1);
  });

  it("Reihenfolge: Stand, dann Plan-Reihenfolge, früher zuletzt zuerst", () => {
    expect(sectionsOf(items).map((s) => s.status)).toEqual(["aktuell", "geplant", "frueher", "moeglich"]);
    const frueher = items.filter((i) => i.status === "frueher").map((i) => i.key);
    expect(frueher.indexOf("metoclopramid")).toBeLessThan(frueher.indexOf("metamizol")); // 13. Mai vor 10. Mai
    expect(frueher[frueher.length - 1]).not.toBe("metoclopramid");
  });

  it("findet die Zeile auch über die Plan-Kennung", () => {
    expect(findMedication(items, "sole")?.key).toBe("natriumchlorid");
    expect(findMedication(items, "sucra")?.key).toBe("sucralfat");
    expect(findMedication(items, "metamizol")?.key).toBe("metamizol");
    expect(findMedication(items, "gibtesnicht")).toBeNull();
    expect(findMedication(items, "food")).toBeNull();
  });

  it("Texte der Liste", () => {
    expect(rowSub(byKey("omeprazol"), TODAY)).toBe("2 × 10 mg täglich · 07:00 und 19:00 Uhr");
    expect(rowSub(byKey("salmeterol-fluticason"), TODAY)).toBe("Noch nicht begonnen · 09:15 und 20:15 Uhr");
    expect(rowSub(byKey("metamizol"), TODAY)).toBe("Schmerzmittel · zuletzt 10. Mai");
    expect(rowSub(byKey("maropitant"), TODAY)).toBe("Mittel gegen Erbrechen · pausiert");
    expect(rowSub(byKey("pimobendan"), TODAY)).toBe("Herzmittel · in Fragen an die Klinik");
    expect(rowSub(byKey("imidacloprid-moxidectin"), TODAY)).toBe("Spot-on gegen Parasiten · in der Akte erwähnt");
    expect(whenText("2030-05-15", TODAY)).toBe("heute");
    expect(whenText("2030-05-14", TODAY)).toBe("gestern");
    expect(whenText("2030-05-01", TODAY)).toBe("1. Mai");
    expect(whenText("2029-11-23", TODAY)).toBe("Nov. 2029");
  });

  it("leere Daten ergeben eine leere Liste", () => {
    expect(buildMedications({ regimens: [], entries: [], events: [], questions: [], checks: [], today: TODAY })).toEqual([]);
  });
});

describe("Namen aus dem Plan", () => {
  // „Probespray“ kennt der Katalog nicht; der Zweck im Plan nennt die Wirkstoffe.
  const probe = reg({ id: "pr", name: "Probespray", category: "inh", purpose: "Atemwege (Salmeterol und Fluticason)", slots: [{ key: "p1", time: "09:00" }], steps: [{ from: "2030-05-01", to: null }] });
  const entries = [entry("2030-05-12", "Probespray 1 Hub")];
  const events = [event("p-e", "2030-05-10", "Beginn mit Probespray", "Zweimal täglich.", "therapie")];
  const questions = [question("p-q", "Wie lange soll das Probespray gegeben werden?")];

  it("gelten auch in Einträgen, Chronik und Fragen", () => {
    const items = buildMedications({ regimens: [probe], entries, events, questions, checks: [], today: TODAY });
    expect(items.map((i) => i.key)).toEqual(["salmeterol-fluticason"]);
    expect(items[0].evidence.map((e) => e.kind).sort()).toEqual(["eintrag", "ereignis", "frage"]);
    expect(items[0].evidence.every((e) => !e.guess)).toBe(true);
  });

  it("ohne Plan bleibt der Name unbekannt", () => {
    const items = buildMedications({ regimens: [], entries, events, questions, checks: [], today: TODAY });
    expect(items.some((i) => i.substance)).toBe(false);
    expect(items.map((i) => i.key)).toEqual(["e-probespray"]);
  });

  it("Namen, die der Katalog schon kennt, brauchen keine eigene Regel", () => {
    expect(planNames([ome, sucra, sole])).toEqual([]);
    expect(planNames([probe]).map((n) => n.substance.id)).toEqual(["salmeterol-fluticason"]);
  });
});
