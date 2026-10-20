// Textfassungen für Weitergabe an Klinik oder Claude, und CSV-Export.

import type { Check, DayNote, Entry, Member, Photo, Regimen } from "@shared/types.ts";
import { dayRange, fmtDMY, fmtDayShort } from "@shared/dates.ts";
import { itemState, itemsForDay } from "@shared/plan.ts";
import { TYPES, fmtNum, summarize } from "@shared/entryTypes.ts";
import { dayStats, foodOfDay, fluidOfDay, sortEntries } from "@shared/stats.ts";

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
      lines.push(`  ${st.done ? st.at : "–    "}  ${it.title}${st.done ? (name ? ` (${name})` : "") : ` (offen, Plan ${it.time})`}`);
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
    const done = items.filter((it) => itemState(it, day, d.checks, d.entries, d.photos).done).length;
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
      if (st.done) rows.push([fmtDMY(day), st.at || "", "Plan", it.title, "", who(d, st.by)]);
    }
    for (const e of sortEntries(d.entries.filter((x) => x.day === day))) {
      const text = (e.data as Record<string, unknown>)?.text;
      rows.push([fmtDMY(day), e.time, TYPES[e.type]?.short || e.type, summarize(e), text ? String(text) : "", who(d, e.created_by)]);
    }
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
