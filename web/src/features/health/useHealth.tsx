// Daten für die Health-Ansichten: Quellen, Messreihen je Messwert, Angepinntes und Schnell eintragen je Gerät.

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useChecks, useDayNotes, useEntries, usePhotos, useProfile, useRegimens } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { addDays } from "@shared/dates.ts";
import type { EntryType } from "@shared/types.ts";
import { DEFAULT_PINNED, DEFAULT_QUICK, type MetricDef } from "../../lib/health/metrics";
import { dayValues, planDays, samplesOf, type DayVal, type Sample, type Sources } from "../../lib/health/series";

const SourcesCtx = createContext<Sources | null>(null);

/** Stellt die Quellen der Messreihen einmal für alle Seiten bereit. */
export function SourcesProvider({ children }: { children: ReactNode }) {
  const src = useBuildSources();
  return <SourcesCtx.Provider value={src}>{children}</SourcesCtx.Provider>;
}

export function useSources(): Sources {
  const v = useContext(SourcesCtx);
  if (!v) throw new Error("SourcesProvider fehlt");
  return v;
}

/** Alle Quellen der Messreihen, einmal berechnet. */
function useBuildSources(): Sources {
  const entries = useEntries();
  const notes = useDayNotes();
  const photos = usePhotos();
  const profile = useProfile();
  const regimens = useRegimens();
  const checks = useChecks();
  const now = useNowValue();
  const weights = useMemo(() => (profile?.data?.weights || []).map((w) => ({ date: w.date, kg: Number(w.kg) })).filter((w) => isFinite(w.kg)), [profile]);
  // Planstand: ab dem frühesten Planbeginn, höchstens ein Jahr zurück
  const plan = useMemo(() => {
    let from = addDays(now.day, -365);
    let first: string | null = null;
    for (const r of regimens) for (const s of r.steps || []) if (s.from && (!first || s.from < first)) first = s.from;
    if (first && first > from) from = first;
    return planDays(regimens, checks, from, now);
  }, [regimens, checks, now]);
  return useMemo(() => ({ entries, notes, photos, weights, plan }), [entries, notes, photos, weights, plan]);
}

export interface Series {
  samples: Sample[];
  days: Map<string, DayVal>;
}

export function seriesOf(def: MetricDef, src: Sources): Series {
  const samples = samplesOf(def, src);
  return { samples, days: dayValues(def, samples, src.plan) };
}

export function useSeries(def: MetricDef | undefined, src: Sources): Series | null {
  return useMemo(() => (def ? seriesOf(def, src) : null), [def, src]);
}

// ---------------------------------------------------------------------------
// Einstellungen je Gerät (wie Angepinnt in Health)
// ---------------------------------------------------------------------------

function makeListStore<T extends string>(key: string, fallback: T[]) {
  const listeners = new Set<() => void>();
  const read = (): T[] => {
    try {
      const raw = localStorage.getItem(key);
      const v = raw ? (JSON.parse(raw) as unknown) : null;
      return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as T[]) : fallback;
    } catch {
      return fallback;
    }
  };
  let value: T[] = typeof window === "undefined" ? fallback : read();
  return {
    get: () => value,
    set: (v: T[]) => {
      value = v;
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* Speicher gesperrt: gilt bis zum Neuladen */
      }
      for (const l of listeners) l();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

const pinnedStore = makeListStore<string>("spotty-angepinnt", DEFAULT_PINNED);
const quickStore = makeListStore<EntryType>("spotty-schnell", DEFAULT_QUICK);
const dismissedStore = makeListStore<string>("spotty-ausgeblendet", []);

export function usePinned(): [string[], (v: string[]) => void] {
  const v = useSyncExternalStore(pinnedStore.subscribe, pinnedStore.get, pinnedStore.get);
  return [v, pinnedStore.set];
}

export function togglePinned(id: string) {
  const v = pinnedStore.get();
  pinnedStore.set(v.includes(id) ? v.filter((x) => x !== id) : [...v, id]);
}

export function useQuick(): [EntryType[], (v: EntryType[]) => void] {
  const v = useSyncExternalStore(quickStore.subscribe, quickStore.get, quickStore.get);
  return [v, quickStore.set];
}

export function toggleQuick(t: EntryType) {
  const v = quickStore.get();
  quickStore.set(v.includes(t) ? v.filter((x) => x !== t) : [...v, t]);
}

/** Ausgeblendete Hinweiskarten (Schlüssel enthalten bei Tageshinweisen den Tag). */
export function useDismissed(): [Set<string>, (key: string) => void] {
  const v = useSyncExternalStore(dismissedStore.subscribe, dismissedStore.get, dismissedStore.get);
  const set = useMemo(() => new Set(v), [v]);
  return [
    set,
    (key: string) => {
      const cur = dismissedStore.get();
      if (!cur.includes(key)) dismissedStore.set([...cur.slice(-200), key]);
    },
  ];
}
