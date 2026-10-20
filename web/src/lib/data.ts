// Lesende Hooks und schreibende Aktionen für die fachlichen Tabellen.

import { useMemo } from "react";
import { newId, store, useRows } from "./store";
import type { Check, DayNote, Doc, Entry, EntryType, Lab, Photo, Profile, Question, Regimen, TimelineEvent } from "@shared/types.ts";
import { berlinNow } from "@shared/dates.ts";
import { itemsForDay } from "@shared/plan.ts";

export const useRegimens = () => useRows<Regimen>("regimens");
export const useChecks = () => useRows<Check>("checks");
export const useEntries = () => useRows<Entry>("entries");
export const useDayNotes = () => useRows<DayNote>("days");
export const usePhotos = () => useRows<Photo>("photos");
export const useDocs = () => useRows<Doc>("documents");
export const useLabs = () => useRows<Lab>("labs");
export const useEvents = () => useRows<TimelineEvent>("events");
export const useQuestions = () => useRows<Question>("questions");

export function useProfile(): Profile | null {
  const rows = useRows<Profile>("profile");
  return rows[0] || null;
}

export function usePlan(day: string) {
  const regs = useRegimens();
  return useMemo(() => itemsForDay(regs, day), [regs, day]);
}

function stamp() {
  return { created_by: store.userId || null, created_at: new Date().toISOString() };
}

export function checkItem(day: string, slot: string, time?: string) {
  store.upsert("checks", { day, slot, time: time || berlinNow().hm, ...stamp() });
}

export function setCheckTime(day: string, slot: string, time: string) {
  store.patch("checks", { day, slot }, { time });
}

export function uncheckItem(day: string, slot: string) {
  store.remove("checks", { day, slot });
}

export function saveEntry(e: Partial<Entry> & { type: EntryType; day: string; time: string; data: Record<string, unknown> }): Entry {
  const id = e.id || newId();
  const existing = store.find<Entry>("entries", { id });
  const row: Entry = {
    ...(existing || {}),
    ...e,
    id,
    slot: e.slot ?? existing?.slot ?? null,
    ack: e.ack ?? existing?.ack ?? false,
    source: e.source || existing?.source || "app",
    created_by: existing?.created_by ?? store.userId ?? null,
    created_at: existing?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Entry;
  store.upsert("entries", row as unknown as Record<string, unknown>);
  return row;
}

export function deleteEntry(id: string) {
  store.remove("entries", { id });
}

export function ackEntry(id: string) {
  store.patch("entries", { id }, { ack: true });
}

export function saveDayNote(day: string, changes: Partial<DayNote>) {
  store.patch("days", { day }, { day, ...changes });
}

export function savePhoto(p: Photo) {
  store.upsert("photos", { ...stamp(), ...p } as unknown as Record<string, unknown>);
}

export function deletePhotoRow(id: string) {
  store.remove("photos", { id });
}

export function saveRegimen(r: Regimen) {
  store.upsert("regimens", r as unknown as Record<string, unknown>);
}

export function deleteRegimen(id: string) {
  store.remove("regimens", { id });
}

export function saveDoc(d: Doc) {
  store.upsert("documents", { ...d, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>);
}

export function deleteDoc(id: string) {
  store.remove("documents", { id });
}

export function saveLab(l: Lab) {
  store.upsert("labs", l as unknown as Record<string, unknown>);
}

export function deleteLab(id: string) {
  store.remove("labs", { id });
}

export function saveEvent(e: TimelineEvent) {
  store.upsert("events", { ...stamp(), ...e } as unknown as Record<string, unknown>);
}

export function deleteEvent(id: string) {
  store.remove("events", { id });
}

export function saveQuestion(q: Question) {
  store.upsert("questions", q as unknown as Record<string, unknown>);
}

export function deleteQuestion(id: string) {
  store.remove("questions", { id });
}

export function saveProfile(p: Profile) {
  store.upsert("profile", { ...p, id: 1 } as unknown as Record<string, unknown>);
}
