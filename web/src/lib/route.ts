// Navigation über den Hash der Adresse, aufgebaut wie die Health-App: zwei Reiter (Übersicht, Entdecken)
// mit eigenen Unterseiten (#entdecken/k/atmung, #uebersicht/m/atem) und Claude als eigene Seite.
// Jede Seite bekommt einen Eintrag im Browserverlauf, damit die Zurück-Geste des Telefons funktioniert.
// Die App merkt sich je Reiter die zuletzt offene Unterseite und je Seite die Scrollposition.
// Adressen der früheren Fassung (#heute, #protokoll, #verlauf/atem, #akte/labor …) werden umgeleitet.

import { useSyncExternalStore } from "react";

export type Tab = "uebersicht" | "entdecken" | "claude";
export const TAB_IDS: Tab[] = ["uebersicht", "entdecken", "claude"];

export interface Route {
  path: string;
  tab: Tab;
  /** Pfad ohne Reiter, z. B. ["m", "atem"] */
  sub: string[];
}

type Move = "push" | "back" | "forward" | "replace" | "load";

const LEGACY: [RegExp, string][] = [
  [/^heute(\/.*)?$/, "uebersicht"],
  [/^protokoll(\/.*)?$/, "uebersicht/protokoll"],
  [/^verlauf\/(atem|trinken|futter|gewicht|spo2|plan)$/, "entdecken/m/$1"],
  [/^verlauf(\/.*)?$/, "entdecken"],
  [/^akte\/dokumente$/, "entdecken/akte/dokumente"],
  [/^akte\/dokument\/(.+)$/, "entdecken/akte/dokument/$1"],
  [/^akte\/(labor|chronik|fragen)$/, "entdecken/akte/$1"],
  [/^akte(\/.*)?$/, "entdecken"],
  [/^mehr(\/.*)?$/, "uebersicht"],
];

const TITLES: [RegExp, string][] = [
  [/^uebersicht$/, "Übersicht"],
  [/^entdecken$/, "Entdecken"],
  [/^claude$/, "Claude"],
  [/\/protokoll(\/[^/]+)?$/, "Tagesprotokoll"],
  [/\/protokolle$/, "Tagesprotokolle"],
  [/\/protokolle\/[^/]+$/, "Tagesprotokoll"],
  [/\/medikamente(\/.*)?$/, "Medikamente"],
  [/\/tagesplan$/, "Tagesplan"],
  [/\/m\/[^/]+\/daten$/, "Alle Daten"],
  [/\/m\/[^/]+$/, "Messwert"],
  [/\/k\/[^/]+$/, "Kategorie"],
  [/\/alle-daten$/, "Alle Daten"],
  [/\/trends$/, "Trends"],
  [/\/highlights$/, "Highlights"],
  [/\/tabelle$/, "Tage im Überblick"],
  [/\/artikel(\/.*)?$/, "Artikel"],
  [/\/akte\/dokument(e)?(\/.*)?$/, "Dokumente"],
  [/\/akte\/labor$/, "Laborergebnisse"],
  [/\/akte\/chronik$/, "Chronik"],
  [/\/akte\/fragen$/, "Fragen an die Klinik"],
  [/\/akte\/.+$/, "Akte"],
];

export function titleOf(path: string): string {
  for (const [re, t] of TITLES) if (re.test(path)) return t;
  return "Spotty";
}

function clean(path: string): string {
  let p = path.replace(/^#/, "");
  try {
    p = decodeURIComponent(p);
  } catch {
    /* ungültige Kodierung: so lassen */
  }
  return p.replace(/^\/+|\/+$/g, "") || "uebersicht";
}

export function parseRoute(hash: string): Route {
  let path = clean(hash);
  for (const [re, to] of LEGACY) {
    if (re.test(path)) {
      path = path.replace(re, to);
      break;
    }
  }
  const parts = path.split("/").filter(Boolean);
  if (!(TAB_IDS as string[]).includes(parts[0])) return { path: "uebersicht", tab: "uebersicht", sub: [] };
  return { path: parts.join("/"), tab: parts[0] as Tab, sub: parts.slice(1) };
}

let current: Route = parseRoute(typeof location === "undefined" ? "" : location.hash);
let lastMove: Move = "load";
const stack: string[] = [current.path];
let index = 0;
const scroll = new Map<string, number>();
const lastByTab: Partial<Record<Tab, string>> = { [current.tab]: current.path };
let lastTabRoute = current.tab === "claude" ? "uebersicht" : current.path;
const listeners = new Set<() => void>();

// Alte Adresse in der Leiste durch die neue ersetzen (z. B. aus einer Erinnerung mit #heute).
if (typeof location !== "undefined" && clean(location.hash) !== current.path && typeof history !== "undefined") {
  history.replaceState(null, "", `#${current.path}`);
}

function emit() {
  lastByTab[current.tab] = current.path;
  if (current.tab !== "claude") lastTabRoute = current.path;
  for (const l of listeners) l();
}

function saveScroll() {
  if (typeof window !== "undefined") scroll.set(current.path, window.scrollY);
}

if (typeof window !== "undefined") {
  const onChange = () => {
    const r = parseRoute(location.hash);
    if (r.path === current.path) return;
    saveScroll();
    if (index > 0 && stack[index - 1] === r.path) {
      index--;
      lastMove = "back";
    } else if (stack[index + 1] === r.path) {
      index++;
      lastMove = "forward";
    } else {
      stack.splice(index + 1);
      stack.push(r.path);
      index = stack.length - 1;
      lastMove = "push";
    }
    current = r;
    emit();
  };
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const r = parseRoute(path);
  if (r.path === current.path) return;
  saveScroll();
  if (opts.replace) {
    history.replaceState(null, "", `#${r.path}`);
    stack[index] = r.path;
    lastMove = "replace";
  } else {
    history.pushState(null, "", `#${r.path}`);
    stack.splice(index + 1);
    stack.push(r.path);
    index = stack.length - 1;
    lastMove = "push";
  }
  current = r;
  emit();
}

/** Unterseite im aktuellen Reiter öffnen, z. B. sub("m/atem"). */
export function openSub(sub: string) {
  const tab = current.tab === "claude" ? "uebersicht" : current.tab;
  navigate(`${tab}/${sub}`);
}

/** Vorige Seite dieser Sitzung, falls es eine gibt. */
export function previous(): string | null {
  return index > 0 ? stack[index - 1] : null;
}

/** Zurück: zur vorigen Seite, sonst zur übergeordneten. */
export function goBack(parent: string) {
  if (index > 0) {
    history.back();
    return;
  }
  navigate(parent, { replace: true });
}

/** Claude schließen: zurück zur Seite davor, sonst zum zuletzt offenen Reiter. */
export function closeClaude() {
  if (index > 0 && !stack[index - 1].startsWith("claude")) {
    history.back();
    return;
  }
  navigate(lastTabRoute || "uebersicht", { replace: index === 0 });
}

/** Reiter antippen: zur zuletzt offenen Unterseite, beim aktiven Reiter zurück zu dessen Anfang. */
export function openTab(t: Tab) {
  if (current.tab === t) navigate(t);
  else navigate(lastByTab[t] || t);
}

export function lastMoveKind(): Move {
  return lastMove;
}

export function savedScroll(path: string): number | undefined {
  return scroll.get(path);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
