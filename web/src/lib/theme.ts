// Darstellung: System, hell oder dunkel (je Gerät gespeichert).

export type Theme = "system" | "light" | "dark";

const KEY = "spotty-theme";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: Theme = getTheme()): void {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  for (const m of Array.from(document.querySelectorAll('meta[name="theme-color"]'))) {
    m.setAttribute("content", dark ? "#0d1412" : "#f1f4f2");
    m.removeAttribute("media");
  }
}

export function setTheme(t: Theme): void {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* gesperrt */
  }
  applyTheme(t);
}
