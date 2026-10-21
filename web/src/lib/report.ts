// Textfassungen für Weitergabe an Klinik oder Claude, und CSV-Export.

import type { Check, DayNote, Entry, Member, Photo, Profile, Question, Regimen } from "@shared/types.ts";
import { addDays, ageAt, dayRange, fmtDM, fmtDMY, fmtDayShort, minutesOf } from "@shared/dates.ts";
import { itemGiven, itemState, itemsForDay, therapyStart } from "@shared/plan.ts";
import { LAGE_KURZ, TYPES, entryAlert, fmtNum, num, summarize } from "@shared/entryTypes.ts";
import { dayStats, foodOfDay, fluidOfDay, median, sortEntries } from "@shared/stats.ts";

export interface ReportData {
  regimens: Regimen[];
  checks: Check[];
  entries: Entry[];
  photos: Photo[];
  days: DayNote[];
  members: Member[];
}

function who(d: ReportData, id: string | null | undefined): string {
  return d.members.find((m) => m.user_id === id)?.name || "";
}

export function dayText(d: ReportData, day: string): string {
  const lines: string[] = [`Spotty – ${fmtDayShort(day)}${day.slice(0, 4)}`];
  const items = itemsForDay(d.regimens, day);
  if (items.length) {
    lines.push("", "Plan:");
    for (const it of items) {
      const st = itemState(it, day, d.checks, d.entries, d.photos);
      const name = st.done ? who(d, st.by) : "";
      lines.push(`  ${st.done ? st.at : "–    "}  ${it.title}${st.skipped ? ` (ausgelassen${name ? `, ${name}` : ""})` : st.done ? (name ? ` (${name})` : "") : ` (offen, Plan ${it.time})`}`);
    }
  }
  const es = sortEntries(d.entries.filter((e) => e.day === day));
  if (es.length) {
    lines.push("", "Protokoll:");
    for (const e of es) {
      const text = (e.data as Record<string, unknown>)?.text;
      lines.push(`  ${e.time}  ${TYPES[e.type]?.short || e.type}: ${summarize(e)}${text ? ` – ${text}` : ""}`);
    }
  }
  const note = d.days.find((x) => x.day === day) || null;
  const st = dayStats(d.entries, day, note);
  const fl = fluidOfDay(st);
  const fo = foodOfDay(st);
  lines.push(
    "",
    "Bilanz: " +
      [
        fl.ml != null ? `Trinken ${fmtNum(fl.ml)} ml${fl.source === "papier" ? " (laut Papier)" : ""}` : "",
        fo.g != null ? `Futter ${fmtNum(fo.g)} g${fo.source === "papier" ? " (laut Papier)" : ""}` : "",
        st.atemWert != null ? `Atemzüge Tageswert ${fmtNum(st.atemWert)}/min` : "",
        st.spo2Min != null ? `SpO₂ min ${fmtNum(st.spo2Min)} %` : "",
        st.kg != null ? `Gewicht ${fmtNum(st.kg, 1)} kg` : "",
        `Kot ${st.kot}×`,
        `Urin ${st.urin}×`,
        `Erbrechen ${st.erbrechen}×`,
        `Husten ${st.husten}×`,
      ]
        .filter(Boolean)
        .join(" · "),
  );
  if (note?.nacht) lines.push(`Nacht: ${note.nacht}`);
  if (note?.note) lines.push(`Notiz: ${note.note}`);
  const ph = d.photos.filter((p) => p.day === day).length;
  if (ph) lines.push(`Protokollfotos: ${ph}`);
  return lines.join("\n");
}

export function rangeText(d: ReportData, from: string, to: string): string {
  const lines: string[] = [`Spotty – Verlauf ${fmtDMY(from)} bis ${fmtDMY(to)}`, ""];
  for (const day of dayRange(from, to)) {
    const note = d.days.find((x) => x.day === day) || null;
    const st = dayStats(d.entries, day, note);
    const fl = fluidOfDay(st);
    const fo = foodOfDay(st);
    const items = itemsForDay(d.regimens, day).filter((it) => it.kind === "check");
    const done = items.filter((it) => itemGiven(itemState(it, day, d.checks, d.entries, d.photos))).length;
    const parts = [
      st.atem.length ? `Atemzüge ${st.atem.map((a) => `${a.time} ${fmtNum(a.bpm)}${a.zustand === "schlaeft" ? " (Schlaf)" : a.zustand === "aktiv" ? " (nach Bewegung)" : ""}`).join(", ")}${st.atemWert != null ? ` → Tageswert ${fmtNum(st.atemWert)}` : ""}` : "",
      st.spo2.length ? `SpO₂ ${st.spo2.map((s) => `${fmtNum(s.pct)} %`).join(", ")}` : "",
      st.kg != null ? `Gewicht ${fmtNum(st.kg, 1)} kg` : "",
      fl.ml != null ? `Trinken ${fmtNum(fl.ml)} ml` : "",
      fo.g != null ? `Futter ${fmtNum(fo.g)} g` : "",
      st.kot ? `Kot ${st.kot}×${st.kotSchwarz ? ` (${st.kotSchwarz}× schwarz)` : ""}` : "",
      st.erbrechen ? `Erbrechen ${st.erbrechen}×` : "",
      st.husten ? `Husten ${st.husten}×` : "",
      st.schmerz ? `Schmerzreaktion ${st.schmerz}×` : "",
      items.length ? `Plan ${done}/${items.length}` : "",
      note?.nacht ? `Nacht ${note.nacht}` : "",
    ].filter(Boolean);
    lines.push(`${fmtDayShort(day)}: ${parts.length ? parts.join(" · ") : "keine Einträge"}`);
    if (note?.note) lines.push(`   Notiz: ${note.note}`);
  }
  return lines.join("\n");
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(d: ReportData, from: string, to: string): string {
  const rows: string[][] = [["Datum", "Uhrzeit", "Art", "Inhalt", "Notiz", "Von"]];
  for (const day of dayRange(from, to)) {
    const items = itemsForDay(d.regimens, day);
    for (const it of items) {
      if (it.kind !== "check") continue;
      const st = itemState(it, day, d.checks, d.entries, d.photos);
      if (st.done) rows.push([fmtDMY(day), st.at || "", "Plan", it.title, st.skipped ? "ausgelassen" : "", who(d, st.by)]);
    }
    for (const e of sortEntries(d.entries.filter((x) => x.day === day))) {
      const text = (e.data as Record<string, unknown>)?.text;
      rows.push([fmtDMY(day), e.time, TYPES[e.type]?.short || e.type, summarize(e), text ? String(text) : "", who(d, e.created_by)]);
    }
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

// ---------------------------------------------------------------------------
// Verlaufsbericht für die Klinik
// ---------------------------------------------------------------------------

export interface ClinicReportData extends ReportData {
  profile: Profile | null;
  questions: Question[];
}

export interface ClinicReportOptions {
  /** Problemliste aus der Akte voranstellen (für Praxen, die den Hund nicht kennen). */
  problems?: boolean;
  /** Offene Fragen an die Klinik anhängen. */
  questions?: boolean;
}

const dm = (day: string) => fmtDM(day);

/** Bericht über einen Zeitraum: Behandlung und Einhaltung, Atmung, Sättigung, Gewicht, Trinken, Futter, Auffälligkeiten, offene Fragen. */
export function clinicReport(d: ClinicReportData, from: string, to: string, now: { day: string; hm: string }, opts: ClinicReportOptions = {}): string {
  const p = d.profile?.data || {};
  const days = dayRange(from, to);
  const L: string[] = [];
  L.push(`${p.name || "Spotty"} – Verlaufsbericht ${fmtDMY(from)} bis ${fmtDMY(to)}${to === now.day ? ` (heute bis ${now.hm} Uhr)` : ""}`);
  const age = p.born ? ageAt(p.born, to) : null;
  const head = [p.species, p.breed, p.sex, p.born ? `geb. ${fmtDMY(p.born)}${age ? ` (${age.years} J.)` : ""}` : ""].filter(Boolean).join(", ");
  if (head) L.push(head);
  for (const allergy of (p.allergies || []).filter((a) => a.items?.length)) {
    const items = [...new Set(allergy.items.filter(Boolean))];
    const shown = items.slice(0, 12);
    L.push(`Unverträglichkeiten${allergy.source ? ` laut ${allergy.source}` : ""}: ${shown.join(", ")}${items.length > shown.length ? ` und ${items.length - shown.length} weitere` : ""}`);
  }

  if (opts.problems && p.problems?.length) {
    L.push("", "Bekannte Probleme");
    p.problems.forEach((x, i) => {
      L.push(`${i + 1}. ${x.title}`);
      if (x.status) L.push(`   Stand: ${x.status}`);
    });
  }

  // Behandlung: Dosisstufen im Zeitraum und abgehakte Gaben
  interface RegSum {
    name: string;
    inh: boolean;
    paused: boolean;
    planned: number;
    given: number;
    missed: string[];
    skipped: string[];
    segs: { dose: string; from: string }[];
  }
  // Pausierte Pläne zählen mit, soweit im Zeitraum tatsächlich abgehakt wurde.
  const paused = new Set(d.regimens.filter((r) => !r.active).map((r) => r.id));
  const allRegs = d.regimens.map((r) => (r.active ? r : { ...r, active: true }));
  const byReg = new Map<string, RegSum>();
  for (const day of days) {
    for (const it of itemsForDay(allRegs, day)) {
      if (it.kind !== "check" || (it.category !== "med" && it.category !== "inh")) continue;
      const isPaused = paused.has(it.regimenId);
      const st = itemState(it, day, d.checks, d.entries, d.photos);
      const done = st.done;
      if (isPaused && !itemGiven(st)) continue;
      const reg = d.regimens.find((r) => r.id === it.regimenId);
      if (!byReg.has(it.regimenId)) byReg.set(it.regimenId, { name: reg?.name || it.title, inh: it.category === "inh", paused: isPaused, planned: 0, given: 0, missed: [], skipped: [], segs: [] });
      const r = byReg.get(it.regimenId)!;
      const dose = it.dose || "";
      if (!r.segs.length || r.segs[r.segs.length - 1].dose !== dose) r.segs.push({ dose, from: day });
      if (!done && day === now.day && minutesOf(it.time) > minutesOf(now.hm)) continue;
      r.planned++;
      if (itemGiven(st)) r.given++;
      else if (st.skipped) r.skipped.push(`${dm(day)} ${it.time}`);
      else r.missed.push(`${dm(day)} ${it.time}`);
    }
  }
  const treat: string[] = [];
  for (const r of byReg.values()) {
    const doses = r.segs.filter((s) => s.dose);
    const doseText = doses.length === 1 && r.segs.length === 1 ? ` ${doses[0].dose}` : doses.length ? `: ${doses.map((s) => `${s.dose} ab ${dm(s.from)}`).join(", ")}` : "";
    const unitOf = (n: number) => (r.inh ? (n === 1 ? "Anwendung" : "Anwendungen") : n === 1 ? "Gabe" : "Gaben");
    if (r.paused) {
      treat.push(`- ${r.name}${doseText} – derzeit pausiert; im Zeitraum ${r.given} ${unitOf(r.given)} abgehakt`);
      continue;
    }
    const skipped = r.skipped.length ? (r.skipped.length <= 4 ? `; bewusst ausgelassen: ${r.skipped.join(", ")}` : `; ${r.skipped.length}× bewusst ausgelassen`) : "";
    const missed = r.missed.length ? (r.missed.length <= 4 ? `; nicht abgehakt: ${r.missed.join(", ")}` : `; ${r.missed.length} nicht abgehakt`) : "";
    treat.push(`- ${r.name}${doseText} – ${r.given} von ${r.planned} ${unitOf(r.planned)} abgehakt${skipped}${missed}`);
  }
  for (const e of d.entries.filter((x) => x.type === "med" && x.day >= from && x.day <= to).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)))
    treat.push(`- zusätzlich ${dm(e.day)} ${e.time}: ${summarize(e)}`);
  if (treat.length) L.push("", "Behandlung", ...treat);

  // Atmung und Sättigung
  const stats = days.map((day) => dayStats(d.entries, day, d.days.find((x) => x.day === day) || null));
  const atemDays = stats.filter((s) => s.atem.length);
  if (atemDays.length) {
    L.push("", "Atemzüge pro Minute in Ruhe (Tageswert = Median der Zählungen)");
    if (atemDays.length <= 21) {
      for (const s of atemDays) {
        const span = s.atem.length > 1 && s.atemMin != null && s.atemMax != null && s.atemMin !== s.atemMax ? ` (${fmtNum(s.atemMin)}–${fmtNum(s.atemMax)}, ${s.atem.length} Zählungen)` : s.atem.length > 1 ? ` (${s.atem.length} Zählungen)` : "";
        L.push(`- ${fmtDayShort(s.day)}: ${s.atemWert != null ? fmtNum(s.atemWert) : "nur nach Bewegung gezählt"}${span}`);
      }
    } else {
      for (let i = 0; i < days.length; i += 7) {
        const chunk = stats.slice(i, i + 7);
        const vals = chunk.flatMap((s) => s.atem.filter((a) => a.zustand !== "aktiv").map((a) => a.bpm));
        if (!vals.length) continue;
        const last = chunk[chunk.length - 1].day;
        L.push(`- ${dm(chunk[0].day)}–${dm(last)}: Median ${fmtNum(median(vals))} (${fmtNum(Math.min(...vals))}–${fmtNum(Math.max(...vals))}, ${vals.length} Zählungen)`);
      }
    }
    const sides = new Map<string, number[]>();
    for (const s of atemDays)
      for (const a of s.atem) {
        if (a.zustand === "aktiv" || !a.lage) continue;
        if (!sides.has(a.lage)) sides.set(a.lage, []);
        sides.get(a.lage)!.push(a.bpm);
      }
    if (sides.size > 1) L.push("- nach Liegeseite (Median): " + [...sides.entries()].map(([k, v]) => `${LAGE_KURZ[k] || k} ${fmtNum(median(v))} (${v.length}×)`).join(", "));
    const o2 = atemDays.reduce((n, s) => n + s.atem.filter((a) => a.o2).length, 0);
    if (o2) L.push(`- davon ${o2} ${o2 === 1 ? "Zählung" : "Zählungen"} unter Sauerstoff`);
  }
  // Vergleich mit den zwei Wochen vor Therapiebeginn, wenn der Zeitraum danach liegt
  const start = therapyStart(d.regimens);
  if (start && from >= start) {
    const pre = d.entries
      .filter((e) => e.type === "atem" && e.day < start && e.day >= addDays(start, -14))
      .filter((e) => (e.data as Record<string, unknown>)?.zustand !== "aktiv")
      .map((e) => ({ day: e.day, bpm: num((e.data as Record<string, unknown>)?.bpm) }))
      .filter((x): x is { day: string; bpm: number } => x.bpm != null)
      .sort((a, b) => a.day.localeCompare(b.day));
    if (pre.length) {
      const v = pre.map((x) => x.bpm);
      if (!atemDays.length) L.push("", "Atemzüge pro Minute in Ruhe");
      L.push(`- zum Vergleich vor Therapiebeginn (${dm(pre[0].day)}–${dm(pre[pre.length - 1].day)}): Median ${fmtNum(median(v))} (${fmtNum(Math.min(...v))}–${fmtNum(Math.max(...v))}, ${v.length} Zählungen)`);
    }
  }
  const spo = stats.flatMap((s) => s.spo2.map((x) => ({ day: s.day, ...x })));
  if (spo.length) {
    const min = spo.reduce((m, x) => (x.pct < m.pct ? x : m), spo[0]);
    const under = spo.filter((x) => x.pct < 95).length;
    L.push("", `SpO₂: ${spo.length} ${spo.length === 1 ? "Messung" : "Messungen"}, niedrigster Wert ${fmtNum(min.pct)} % am ${dm(min.day)} um ${min.time} Uhr${under ? `, ${under}× unter 95 %` : ""}`);
  }

  // Gewicht
  const weights = [
    ...stats.filter((s) => s.kg != null).map((s) => ({ day: s.day, kg: s.kg as number })),
    ...(p.weights || []).filter((w) => w.date >= from && w.date <= to && !stats.some((s) => s.day === w.date && s.kg != null)).map((w) => ({ day: w.date, kg: w.kg })),
  ].sort((a, b) => a.day.localeCompare(b.day));
  if (weights.length) {
    const shown = weights.length > 8 ? [weights[0], ...weights.slice(-6)] : weights;
    L.push("", `Gewicht: ${shown.map((w, i) => `${i === 1 && shown !== weights ? "… " : ""}${fmtNum(w.kg, 1)} kg (${dm(w.day)})`).join(" → ")}`);
  }

  // Trinken und Futter
  const fl = stats.map((s) => ({ day: s.day, selbst: s.selbstMl, ...fluidOfDay(s) })).filter((x) => x.ml != null);
  const fo = stats.map((s) => ({ day: s.day, ...foodOfDay(s) })).filter((x) => x.g != null);
  const refused = stats.reduce((n, s) => n + s.abgelehnt, 0);
  const pain = stats.reduce((n, s) => n + s.schmerz, 0);
  if (fl.length || fo.length || refused || pain) {
    L.push("", "Trinken und Futter");
    // Der laufende Tag ist unvollständig und bleibt aus dem Durchschnitt heraus.
    const line = <T extends { day: string }>(label: string, unit: string, xs: T[], val: (x: T) => number, self?: (x: T) => number) => {
      const full = xs.filter((x) => x.day !== now.day);
      const today = xs.find((x) => x.day === now.day);
      const list = xs.length <= 14 ? `: ${xs.map((x) => `${dm(x.day)} ${fmtNum(val(x))} ${unit}${x.day === now.day ? " (bis jetzt)" : ""}`).join(" · ")}` : "";
      if (!full.length) {
        const own = today && self ? self(today) : 0;
        return `- ${label} heute bis ${now.hm} Uhr: ${fmtNum(today ? val(today) : 0)} ${unit}${own ? `, davon ${fmtNum(own)} ${unit} selbst` : ""}`;
      }
      const avg = full.reduce((a, x) => a + val(x), 0) / full.length;
      const ownAvg = self ? full.reduce((a, x) => a + self(x), 0) / full.length : 0;
      return `- ${label} Ø ${fmtNum(avg)} ${unit} pro Tag${ownAvg >= 1 ? `, davon Ø ${fmtNum(ownAvg)} ${unit} selbst` : ""} (${full.length} ${full.length === 1 ? "abgeschlossener Tag" : "abgeschlossene Tage"} mit Angabe)${list}`;
    };
    if (fl.length) L.push(line("Trinken", "ml", fl, (x) => x.ml as number, (x) => (x.source === "einträge" ? x.selbst : 0)));
    if (fo.length) L.push(line("Futter", "g", fo, (x) => x.g as number));
    if (refused || pain) L.push(`- ${[refused ? `${refused}× Futter abgelehnt` : "", pain ? `${pain}× Schmerzreaktion beim oder nach dem Fressen` : ""].filter(Boolean).join(", ")}`);
  }

  // Auffälligkeiten (Warnhinweise, Erbrechen, Husten, auffälliger Kot)
  const notable: string[] = [];
  for (const e of d.entries.filter((x) => x.day >= from && x.day <= to).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))) {
    const a = entryAlert(e);
    const isEvent = e.type === "erbrechen" || e.type === "husten";
    if ((a && a.level !== "info") || isEvent) notable.push(`- ${dm(e.day)} ${e.time} ${TYPES[e.type]?.short || e.type}: ${summarize(e)}`);
  }
  if (notable.length) L.push("", "Auffälligkeiten", ...(notable.length > 25 ? [`(${notable.length - 25} ältere nicht aufgeführt)`] : []), ...notable.slice(-25));

  // Beobachtungen, Nächte, Tagesnotizen (zeitlich geordnet, die jüngsten 25)
  const obs: { key: string; text: string }[] = [];
  for (const e of d.entries.filter((x) => x.type === "notiz" && x.day >= from && x.day <= to)) {
    const t = (e.data as Record<string, unknown>)?.text;
    const sum = summarize(e);
    const parts = [sum, t && !sum.includes(String(t)) ? String(t) : ""].filter(Boolean);
    obs.push({ key: `${e.day} ${e.time}`, text: `- ${dm(e.day)} ${e.time}: ${parts.join(" – ") || "Beobachtung"}` });
  }
  for (const n of d.days.filter((x) => x.day >= from && x.day <= to && (x.nacht || x.note))) {
    obs.push({ key: `${n.day} 00:00`, text: `- ${dm(n.day)}: ${[n.nacht ? `Nacht ${n.nacht}` : "", n.note || ""].filter(Boolean).join(" · ")}` });
  }
  obs.sort((a, b) => a.key.localeCompare(b.key));
  if (obs.length) L.push("", "Beobachtungen", ...(obs.length > 25 ? [`(${obs.length - 25} ältere nicht aufgeführt)`] : []), ...obs.slice(-25).map((o) => o.text));

  if (opts.questions !== false) {
    const open = d.questions.filter((q) => q.status !== "geklaert").sort((a, b) => a.sort - b.sort);
    if (open.length) L.push("", "Offene Fragen", ...open.map((q, i) => `${i + 1}. ${q.text}`));
  }
  L.push("", `Erstellt am ${fmtDMY(now.day)} um ${now.hm} Uhr aus dem gemeinsamen Pflegeprotokoll der Familie.`);
  return L.join("\n");
}
