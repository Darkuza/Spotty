// Navigation über den Hash der Adresse: Reiter und Unterseiten (#akte/dokumente, #verlauf/atem).
// Jede Seite bekommt einen Eintrag im Browserverlauf, damit die Zurück-Geste des Telefons funktioniert.
// Die App merkt sich je Reiter die zuletzt offene Unterseite und je Seite die Scrollposition.

import { useSyncExternalStore } from "react";

export type Tab = "heute" | "protokoll" | "verlauf" | "akte" | "claude";
export const TAB_IDS: Tab[] = ["heute", "protokoll", "verlauf", "akte", "claude"];

export interface Route {
  path: string;
  tab: Tab | null;
  parts: string[];
}

type Move = "push" | "back" | "forward" | "replace" | "load";

const TITLES: Record<string, string> = {
  heute: "Heute",
  protokoll: "Protokoll",
  verlauf: "Verlauf",
  "verlauf/atem": "Atemzüge",
  "verlauf/trinken": "Getrunken",
  "verlauf/futter": "Gefressen",
  "verlauf/gewicht": "Gewicht",
  "verlauf/spo2": "SpO₂",
  "verlauf/plan": "Plan",
  akte: "Akte",
  "akte/dokumente": "Dokumente",
  "akte/dokument": "Dokument",
  "akte/labor": "Laborwerte",
  "akte/chronik": "Chronik",
  "akte/fragen": "Fragen",
  claude: "Claude",
  mehr: "Mehr",
};

export function titleOf(path: string): string {
  const parts = path.split("/");
  for (let n = parts.length; n > 0; n--) {
    const t = TITLES[parts.slice(0, n).join("/")];
    if (t) return t;
  }
  return "Zurück";
}

function clean(path: string): string {
  const p = decodeURIComponent(path.replace(/^#/, "")).replace(/^\/+|\/+$/g, "");
  return p || "heute";
}

export function parseRoute(hash: string): Route {
  const path = clean(hash);
  const parts = path.split("/");
  const tab = (TAB_IDS as string[]).includes(parts[0]) ? (parts[0] as Tab) : null;
  if (!tab && parts[0] !== "mehr") return { path: "heute", tab: "heute", parts: ["heute"] };
  return { path, tab, parts };
}

let current: Route = parseRoute(typeof location === "undefined" ? "" : location.hash);
let lastMove: Move = "load";
const stack: string[] = [current.path];
let index = 0;
const scroll = new Map<string, number>();
const lastByTab: Partial<Record<Tab, string>> = {};
if (current.tab) lastByTab[current.tab] = current.path;
const listeners = new Set<() => void>();

function emit() {
  if (current.tab) lastByTab[current.tab] = current.path;
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
