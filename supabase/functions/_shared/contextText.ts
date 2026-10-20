// Baut den Wissensstand für Claude aus den Daten der App (reine Funktion, ohne Datenbankzugriff).

import type { Check, DayNote, Doc, Entry, Lab, Member, Photo, Profile, Question, Regimen, TimelineEvent } from "./types.ts";
import { addDays, ageAt, dayRange, fmtDMY, fmtDayLong, fmtDayShort } from "./dates.ts";
import { fmtAmount, itemState, itemsForDay, nextChange, stepFor } from "./plan.ts";
import { fmtNum, summarize } from "./entryTypes.ts";
import { dayStats, foodOfDay, fluidOfDay, sortEntries } from "./stats.ts";

export interface ContextData {
  profile: Profile | null;
  regimens: Regimen[];
  documents: Doc[];
  labs: Lab[];
  events: TimelineEvent[];
  questions: Question[];
  entries: Entry[];
  checks: Check[];
  days: DayNote[];
  photos: Photo[];
  members: Member[];
}

export interface ContextText {
  static: string;
  dynamic: string;
}

export const SYSTEM_RULES = `Du bist Claude, eingebaut in eine private Familien-App zur Pflege eines schwer kranken Hundes. Wer der Hund ist, wer zur Familie gehört und wer welche Aufgabe hat, steht in der Akte unten; wer gerade fragt, steht am Ende.

So arbeitest du:
- Antworte auf Deutsch, klar, ruhig und sachlich. Kurze Frage, kurze Antwort; ausführlich nur, wenn danach gefragt wird.
- Stütze dich auf die Daten unten. Nenne bei Befunden und Messwerten Datum und Quelle (Dokument oder Protokoll). Rechne Summen und Durchschnitte aus den Einträgen nach, statt zu schätzen.
- Trenne erkennbar: was dokumentiert ist, was die Familie beobachtet hat und was deine Einschätzung ist. Benenne Unsicherheit offen. Erfinde keine Werte.
- Du ersetzt keine tierärztliche Untersuchung und änderst keine Dosierungen; Änderungen am Plan nur nach Rücksprache mit der Klinik.
- Bei Warnzeichen rätst du klar zum sofortigen Anruf bei der Klinik und nennst die Nummer aus den Kontakten: Atemnot oder deutlich steigende Atemfrequenz, schwarzer klebriger Kot, Erbrechen mit Blut, SpO₂ unter 95 % auch nach Wiederholung, Kollaps, blasses oder graues Zahnfleisch, kein Urin über 12 Stunden.
- Ist ein Foto angehängt (Kot, Erbrochenes, Zahnfleisch, Haut, Wunde, Protokollseite, Packung): beschreibe zuerst sachlich, was darauf zu sehen ist, und ordne es dann ein. Aus einem Foto allein stellst du keine Diagnose; sag, was eine Untersuchung klären müsste und ob es eilt.
- Achte die Leitlinie der Familie für Entscheidungen.
- Formatierung: kurze Absätze; Listen nur für echte Aufzählungen; **fett** sparsam. Keine Tabellen, außer es wird ausdrücklich danach gefragt.`;

function line(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== false && String(p).trim() !== "").join(" ");
}

function nameOf(members: Member[], id: string | null | undefined): string {
  if (!id) return "";
  return members.find((m) => m.user_id === id)?.name || "";
}

export function buildStatic(d: ContextData, today: string): string {
  const p = d.profile?.data || {};
  const out: string[] = [];
  out.push(`# Akte ${p.name || ""}`.trim());
  const age = p.born ? ageAt(p.born, today) : null;
  out.push(
    line(
      `${p.name || "Spotty"}, ${p.species || "Hund"}${p.breed ? `, ${p.breed}` : ""}${p.sex ? `, ${p.sex}` : ""}.`,
      p.born ? `Geboren ${fmtDMY(p.born)}${age ? ` (${age.years} Jahre)` : ""}.` : "",
      p.owner ? `Halterin: ${p.owner}.` : "",
      p.weight_normal ? `Normalgewicht früher ${p.weight_normal}.` : "",
    ),
  );
  if (p.family) out.push(`Familie und Aufgaben: ${p.family}`);
  if (d.members.length) out.push(`Nutzer der App: ${d.members.map((m) => m.name).join(", ")}.`);
  if (p.weights?.length) {
    out.push("Gewichte: " + p.weights.map((w) => `${fmtDMY(w.date)} ${fmtNum(w.kg, 1)} kg${w.source ? ` (${w.source})` : ""}`).join("; ") + ".");
  }
  if (p.problems?.length) {
    out.push("\n## Problemliste");
    p.problems.forEach((pr, i) => {
      out.push(`${i + 1}. ${pr.title}${pr.status ? ` – ${pr.status}` : ""}${pr.since ? ` (seit ${fmtDMY(pr.since)})` : ""}. ${pr.details || ""}`.trim());
    });
  }
  if (p.history?.length) {
    out.push("\n## Vorgeschichte");
    for (const h of p.history) out.push(`- ${h.date}: ${h.text}`);
  }
  if (p.allergies?.length) {
    out.push("\n## Unverträglichkeiten");
    for (const a of p.allergies) out.push(`- ${a.source}: ${a.items.join(", ")}`);
  }
  if (p.care_notes?.length) {
    out.push("\n## Pflegehinweise");
    for (const c of p.care_notes) out.push(`- ${c}`);
  }
  if (p.guiding_principle) out.push(`\n## Leitlinie der Familie\n${p.guiding_principle}`);
  if (p.contacts?.length) {
    out.push("\n## Kontakte");
    for (const c of p.contacts) out.push(`- ${line(c.name, c.role ? `(${c.role})` : "", c.phone ? `Tel. ${c.phone}` : "", c.address || "", c.note ? `– ${c.note}` : "")}`);
  }
  if (p.devices?.length) {
    out.push("\n## Geräte zu Hause");
    for (const dv of p.devices) out.push(`- ${dv.name}${dv.note ? `: ${dv.note}` : ""}`);
  }
  const docs = [...d.documents].sort((a, b) => String(a.doc_date || "").localeCompare(String(b.doc_date || "")));
  if (docs.length) {
    out.push("\n## Dokumente und Befunde (chronologisch)");
    for (const doc of docs) {
      const status = doc.status === "original_fehlt" ? " [Original liegt nicht vor]" : doc.status === "ausstehend" ? " [schriftlich ausstehend]" : "";
      out.push(`\n### ${doc.doc_date ? fmtDMY(doc.doc_date) : "ohne Datum"} – ${doc.title}${doc.issuer ? ` (${doc.issuer})` : ""}${status}`);
      if (doc.summary) out.push(doc.summary);
      for (const f of doc.findings || []) out.push(`- ${f.label}: ${f.text}`);
    }
  }
  if (d.labs.length) {
    out.push("\n## Laborwerte (Wert, Einheit, Referenz, Kennzeichen)");
    const byCode = new Map<string, Lab[]>();
    for (const l of d.labs) {
      const key = `${l.grp || ""}|${l.code || l.param}|${l.unit || ""}`;
      if (!byCode.has(key)) byCode.set(key, []);
      byCode.get(key)!.push(l);
    }
    const keys = [...byCode.keys()].sort();
    for (const k of keys) {
      const list = byCode.get(k)!.sort((a, b) => a.date.localeCompare(b.date));
      const f = list[0];
      const vals = list
        .map((l) => `${fmtDMY(l.date)}: ${l.value_text ?? (l.value != null ? fmtNum(Number(l.value), String(l.value).includes(".") ? 2 : 0) : "–")}${l.flag ? ` (${l.flag})` : ""}${l.note ? ` [${l.note}]` : ""}`)
        .join("; ");
      const ref = f.ref_low != null || f.ref_high != null ? ` Ref. ${f.ref_low ?? ""}–${f.ref_high ?? ""}` : "";
      out.push(`- ${f.param}${f.code ? ` (${f.code})` : ""}${f.unit ? ` [${f.unit}]` : ""}${ref}: ${vals}`);
    }
  }
  const ev = [...d.events].sort((a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")));
  if (ev.length) {
    out.push("\n## Chronologie");
    for (const e of ev) out.push(`- ${fmtDMY(e.date)}${e.time ? ` ${e.time}` : ""}: ${e.title}${e.text ? ` – ${e.text}` : ""}`);
  }
  return out.join("\n");
}

export function buildDynamic(d: ContextData, today: string, nowHm: string, daysBack = 7): string {
  const out: string[] = [];
  out.push(`# Stand jetzt: ${fmtDayLong(today)}, ${nowHm} Uhr (Berlin)`);
  const items = itemsForDay(d.regimens, today);
  if (items.length) {
    out.push("\n## Tagesplan heute");
    for (const it of items) {
      const st = itemState(it, today, d.checks, d.entries, d.photos);
      const who = st.done ? nameOf(d.members, st.by) : "";
      out.push(`- ${it.time} ${it.title}${it.detail ? ` (${it.detail})` : ""}: ${st.done ? `erledigt ${st.at}${who ? ` von ${who}` : ""}` : "offen"}`);
    }
  }
  const meds = d.regimens.filter((r) => r.active && (r.category === "med" || r.category === "inh"));
  if (meds.length) {
    out.push("\n## Medikamente und Fahrplan");
    for (const r of meds) {
      const cur = stepFor(r, today);
      const nc = nextChange(r, today);
      const steps = (r.steps || []).map((s) => `${fmtDMY(s.from)}–${s.to ? fmtDMY(s.to) : "offen"}: ${line(s.dose || "", s.label || "", s.pattern === "alternate" ? "(jeden 2. Tag)" : "")}`).join("; ");
      out.push(
        `- ${r.name}${r.purpose ? ` (${r.purpose})` : ""}: ${cur ? `heute ${line(cur.dose || "", cur.label || "")}` : "heute nicht geplant"}; Zeiten ${r.slots.map((s) => s.time).join(", ") || "–"}${steps ? `; Phasen: ${steps}` : ""}${nc ? `; nächste Änderung ${fmtDMY(nc.day)}${nc.step ? ` → ${nc.step.dose || ""}` : " (Ende)"}` : ""}${r.stock != null ? `; Vorrat ${fmtAmount(Number(r.stock))} ${r.unit || ""} (Stand ${r.stock_at ? r.stock_at.slice(0, 10) : "?"})` : ""}${r.note ? `; Hinweis: ${r.note}` : ""}`,
      );
    }
  }
  const from = addDays(today, -(daysBack - 1));
  out.push(`\n## Tagesbilanzen ${fmtDayShort(from)} bis ${fmtDayShort(today)}`);
  for (const day of dayRange(from, today)) {
    const note = d.days.find((x) => x.day === day) || null;
    const st = dayStats(d.entries, day, note);
    const fl = fluidOfDay(st);
    const fo = foodOfDay(st);
    const planned = itemsForDay(d.regimens, day).filter((it) => it.kind === "check");
    const doneCount = planned.filter((it) => itemState(it, day, d.checks, d.entries, d.photos).done).length;
    out.push(
      `- ${fmtDayShort(day)}: ` +
        [
          st.atemWert != null ? `Atemzüge Tageswert ${fmtNum(st.atemWert)}/min (${st.atem.length} Messungen, ${fmtNum(st.atemMin)}–${fmtNum(st.atemMax)})` : "keine Atemzählung",
          st.spo2Min != null ? `SpO₂ min ${fmtNum(st.spo2Min)} %` : "",
          st.kg != null ? `Gewicht ${fmtNum(st.kg, 1)} kg` : "",
          fl.ml != null ? `Trinken ${fmtNum(fl.ml)} ml${fl.source === "papier" ? " (Papier)" : st.selbstMl ? ` (davon selbst ${fmtNum(st.selbstMl)} ml)` : ""}` : "",
          fo.g != null ? `Futter ${fmtNum(fo.g)} g${fo.source === "papier" ? " (Papier)" : ""}` : st.futterN ? `Futter ${st.futterN}× ohne Gramm` : "",
          st.kot ? `Kot ${st.kot}×${st.kotSchwarz ? `, davon ${st.kotSchwarz}× schwarz` : ""}` : "",
          st.erbrechen ? `Erbrechen ${st.erbrechen}×` : "",
          st.husten ? `Husten ${st.husten}×` : "",
          st.schmerz ? `Schmerzreaktion nach Futter ${st.schmerz}×` : "",
          st.nacht ? `Nacht ${st.nacht}` : "",
          planned.length ? `Plan ${doneCount}/${planned.length} abgehakt` : "",
          d.photos.filter((ph) => ph.day === day).length ? `${d.photos.filter((ph) => ph.day === day).length} Protokollfoto(s)` : "",
        ]
          .filter(Boolean)
          .join(" · "),
    );
  }
  for (const day of [addDays(today, -1), today]) {
    const es = sortEntries(d.entries.filter((e) => e.day === day));
    const note = d.days.find((x) => x.day === day);
    if (!es.length && !note?.note) continue;
    out.push(`\n## Einträge ${day === today ? "heute" : "gestern"} (${fmtDayShort(day)})`);
    for (const e of es) {
      const who = nameOf(d.members, e.created_by);
      const text = (e.data as Record<string, unknown>)?.text;
      out.push(`- ${e.time} ${e.type}: ${summarize(e)}${text ? ` – ${text}` : ""}${who ? ` (${who})` : ""}`);
    }
    if (note?.note) out.push(`- Tagesnotiz: ${note.note}`);
  }
  const open = d.questions.filter((q) => q.status === "offen").sort((a, b) => a.sort - b.sort);
  const answered = d.questions.filter((q) => q.status === "geklaert" && q.answer);
  if (open.length || answered.length) {
    out.push("\n## Fragen an die Klinik");
    for (const q of open) out.push(`- offen: ${q.text}`);
    for (const q of answered) out.push(`- geklärt: ${q.text} → ${q.answer}`);
  }
  return out.join("\n");
}

export function buildContext(d: ContextData, today: string, nowHm: string): ContextText {
  return { static: buildStatic(d, today), dynamic: buildDynamic(d, today, nowHm) };
}
