// Abstandsregeln zwischen Medikamenten, gelesen aus der Anleitung eines Plans,
// z. B. „2 h Abstand zu Omeprazol und Prednisolon“. Daraus entstehen Hinweise im Tagesplan,
// wenn zwei Gaben näher beieinander lagen, und die früheste Uhrzeit für die nächste Gabe.

import type { Check, PlanItem, Regimen } from "@shared/types.ts";
import { hmOf, minutesOf } from "@shared/dates.ts";

export interface GapRule {
  regimenId: string;
  minutes: number;
  others: string[];
}

const RULE = /(\d+(?:[.,]\d+)?)\s*(h|std\.?|stunden?|min\.?|minuten)\s+abstand\s+(?:zu|zum|zur|von)\s+([^·.;\n]+)/gi;

function firstWord(s: string): string {
  return s.trim().split(/\s+/)[0]?.toLowerCase() || "";
}

/** Regeln aus den Anleitungen aller aktiven Pläne. */
export function gapRules(regs: Regimen[]): GapRule[] {
  const out: GapRule[] = [];
  const active = regs.filter((r) => r.active);
  for (const r of active) {
    const text = `${r.instructions || ""}`;
    for (const m of text.matchAll(RULE)) {
      const n = Number(m[1].replace(",", "."));
      const unit = m[2].toLowerCase();
      const minutes = Math.round(unit.startsWith("min") ? n : n * 60);
      if (!(minutes > 0)) continue;
      const names = m[3]
        .split(/,|\bund\b|\boder\b|\bsowie\b/i)
        .map((x) => x.replace(/^(dem|der|den)\s+/i, "").trim())
        .filter(Boolean);
      const others = new Set<string>();
      for (const name of names) {
        const w = firstWord(name);
        if (w.length < 3) continue;
        for (const o of active) {
          if (o.id === r.id) continue;
          const ow = firstWord(o.name);
          if (ow && (ow.startsWith(w) || w.startsWith(ow))) others.add(o.id);
        }
      }
      if (others.size) out.push({ regimenId: r.id, minutes, others: [...others] });
    }
  }
  return out;
}

export interface GapConflict {
  slot: string;
  otherSlot: string;
  otherName: string;
  /** Minuten zwischen den beiden Gaben */
  diff: number;
  minutes: number;
  after: boolean;
}

interface Given {
  item: PlanItem;
  t: number;
}

function givenOf(items: PlanItem[], day: string, checks: Check[]): Given[] {
  const out: Given[] = [];
  for (const it of items) {
    if (it.kind !== "check") continue;
    const c = checks.find((x) => x.day === day && x.slot === it.slot);
    if (c && !c.skipped) out.push({ item: it, t: minutesOf(c.time) });
  }
  return out;
}

function nameOf(regs: Regimen[], id: string): string {
  return regs.find((r) => r.id === id)?.name || "";
}

/** Gaben dieses Tages, die eine Abstandsregel verletzen (je betroffener Gabe ein Eintrag). */
export function gapConflicts(regs: Regimen[], items: PlanItem[], day: string, checks: Check[]): GapConflict[] {
  const rules = gapRules(regs);
  if (!rules.length) return [];
  const given = givenOf(items, day, checks);
  const out: GapConflict[] = [];
  for (const rule of rules) {
    for (const a of given.filter((g) => g.item.regimenId === rule.regimenId)) {
      for (const b of given.filter((g) => rule.others.includes(g.item.regimenId))) {
        const diff = Math.abs(a.t - b.t);
        if (diff < rule.minutes) out.push({ slot: a.item.slot, otherSlot: b.item.slot, otherName: nameOf(regs, b.item.regimenId), diff, minutes: rule.minutes, after: a.t >= b.t });
      }
    }
  }
  return out;
}

/** Früheste Uhrzeit, zu der ein offener Punkt nach den Abstandsregeln gegeben werden sollte (oder null). */
export function earliestFor(regs: Regimen[], items: PlanItem[], day: string, checks: Check[], item: PlanItem): { at: string; minutes: number; otherName: string } | null {
  if (item.kind !== "check") return null;
  const rules = gapRules(regs);
  if (!rules.length) return null;
  const given = givenOf(items, day, checks);
  let best: { t: number; minutes: number; otherName: string } | null = null;
  for (const rule of rules) {
    let partners: Given[] = [];
    if (rule.regimenId === item.regimenId) partners = given.filter((g) => rule.others.includes(g.item.regimenId));
    else if (rule.others.includes(item.regimenId)) partners = given.filter((g) => g.item.regimenId === rule.regimenId);
    for (const p of partners) {
      const t = p.t + rule.minutes;
      if (!best || t > best.t) best = { t, minutes: rule.minutes, otherName: nameOf(regs, p.item.regimenId) };
    }
  }
  if (!best) return null;
  return { at: hmOf(Math.min(best.t, 24 * 60 - 1)), minutes: best.minutes, otherName: best.otherName };
}

/** „40 Minuten“, „1 Std. 20 Min.“, „2 Stunden“ */
export function fmtDuration(min: number): string {
  if (min < 60) return `${min} ${min === 1 ? "Minute" : "Minuten"}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!m) return `${h} ${h === 1 ? "Stunde" : "Stunden"}`;
  return `${h} Std. ${m} Min.`;
}
