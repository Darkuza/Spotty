// Hinweise für „Heute“: kurze, aus den Daten abgeleitete Beobachtungen und Erinnerungen.
// Reine Funktionen, damit sie sich testen lassen.

import type { Entry, ProfileData, Regimen } from "@shared/types.ts";
import { addDays, daysBetween, fmtDM, fmtDayShort, minutesOf, type BerlinNow } from "@shared/dates.ts";
import { dayStats } from "@shared/stats.ts";
import { fmtAmount, nextChange, stepFor, stockProjection } from "@shared/plan.ts";
import { fmtNum, num } from "@shared/entryTypes.ts";

export interface Insight {
  key: string;
  tone: "teal" | "amber" | "blue" | "gray";
  icon: string;
  title: string;
  text: string;
}

function measureActive(regs: Regimen[], measure: string, day: string): Regimen | null {
  return regs.find((r) => r.active && r.category === "mess" && r.measure === measure && !!stepFor(r, day)) || null;
}

function berlinOf(iso: string): { day: string; minutes: number } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { day, minutes: minutesOf(hm) };
}

export function dayInsights(entries: Entry[], regs: Regimen[], profile: ProfileData | null | undefined, day: string, now: BerlinNow): Insight[] {
  const out: Insight[] = [];
  const isToday = day === now.day;
  const tomorrow = addDays(day, 1);

  // Dosiswechsel morgen und Planende
  for (const r of regs) {
    if (!r.active || (r.category !== "med" && r.category !== "inh") || !stepFor(r, day)) continue;
    const nc = nextChange(r, day);
    if (!nc || nc.day !== tomorrow) continue;
    if (nc.step) {
      out.push({ key: `dose-${r.id}`, tone: "blue", icon: "pill", title: `Ab morgen ${r.name}${nc.step.dose ? ` ${nc.step.dose}` : ""}`, text: nc.step.label || "Neue Stufe laut Plan." });
    } else {
      out.push({ key: `end-${r.id}`, tone: "blue", icon: "pill", title: `${r.name}: heute letzter Tag`, text: "Laut Plan endet die Gabe morgen." });
    }
  }

  // Vorrat
  if (isToday) {
    for (const r of regs) {
      if (!r.active || r.stock == null || !r.stock_at) continue;
      const at = berlinOf(r.stock_at);
      const pr = stockProjection(r, Number(r.stock), at.day, at.minutes);
      if (!pr.runsOut) continue;
      const lastDay = pr.lastCovered?.day || at.day;
      if (daysBetween(now.day, pr.runsOut.day) > 4) continue;
      out.push({
        key: `stock-${r.id}`,
        tone: "amber",
        icon: "pill",
        title: `Vorrat ${r.name} reicht bis ${fmtDayShort(lastDay)}`,
        text: `Bis zum Planende fehlen ${fmtAmount(Math.max(0, -pr.remainingAtEnd))} ${r.unit || ""}`.trim() + ".",
      });
    }
  }

  // Sättigung laut Plan, aber lange nicht gemessen
  const spoReg = measureActive(regs, "spo2", day);
  if (spoReg) {
    const last = entries.filter((e) => e.type === "spo2" && e.day <= day).sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time))[0];
    if (!last) out.push({ key: "spo2", tone: "amber", icon: "pulse", title: "SpO₂ noch nicht gemessen", text: `Laut Plan ${spoReg.slots.length === 1 ? "einmal" : `${spoReg.slots.length}-mal`} am Tag; bisher ist kein Wert eingetragen.` });
    else if (daysBetween(last.day, day) >= 2) out.push({ key: "spo2", tone: "amber", icon: "pulse", title: `SpO₂ seit ${daysBetween(last.day, day)} Tagen nicht gemessen`, text: `Zuletzt ${fmtNum(num((last.data as Record<string, unknown>).pct))} % am ${fmtDM(last.day)}.` });
  }

  // Trinkt wieder selbst
  const st = dayStats(entries, day);
  if (st.selbstMl > 0) {
    const prev = [1, 2, 3].map((n) => dayStats(entries, addDays(day, -n))).filter((s) => s.trinkenN > 0);
    if (prev.length && prev.every((s) => s.selbstMl === 0)) {
      out.push({ key: "selbst", tone: "teal", icon: "drop", title: "Trinkt wieder selbst", text: `${isToday ? "Heute bisher" : "An diesem Tag"} ${fmtNum(st.selbstMl)} ml selbst getrunken; an den Tagen davor nur per Spritze.` });
    }
  }

  // Kot und Urin am Abend noch nicht eingetragen (nur, wenn sie sonst eingetragen werden)
  if (isToday && now.minutes >= 17 * 60) {
    const tracked = (type: "kot" | "urin") => entries.some((e) => e.type === type && e.day < day && daysBetween(e.day, day) <= 7);
    const missing = [st.kot === 0 && tracked("kot") ? "Kot" : "", st.urin === 0 && tracked("urin") ? "Urin" : ""].filter(Boolean);
    if (missing.length) {
      out.push({ key: "aus", tone: "gray", icon: "stool", title: missing.length === 2 ? "Kot und Urin fehlen noch" : `${missing[0]} fehlt noch`, text: "Heute ist dazu noch nichts eingetragen." });
    }
  }

  // Gewicht laut Plan, aber länger nicht gewogen
  if (measureActive(regs, "gewicht", day)) {
    const ws = [
      ...entries.filter((e) => e.type === "gewicht" && num((e.data as Record<string, unknown>).kg) != null).map((e) => ({ day: e.day, kg: num((e.data as Record<string, unknown>).kg) as number })),
      ...(profile?.weights || []).map((w) => ({ day: w.date, kg: w.kg })),
    ]
      .filter((w) => w.day <= day)
      .sort((a, b) => b.day.localeCompare(a.day));
    const last = ws[0];
    if (last && daysBetween(last.day, day) >= 3) out.push({ key: "kg", tone: "gray", icon: "scale", title: `Gewicht zuletzt am ${fmtDM(last.day)}`, text: `${fmtNum(last.kg, 1)} kg; laut Plan regelmäßig morgens wiegen.` });
  }

  return out;
}
