// Gerüst der App: Anmeldung, Kopfzeile mit Uhr und Notfall-Taste, fünf Reiter, Update-Hinweis.

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionProvider, useMe, useSession } from "./lib/session";
import { store, useStatus } from "./lib/store";
import { useNow } from "./lib/hooks";
import { useChecks, useEntries, usePhotos, usePlan, useRegimens } from "./lib/data";
import { SheetHost, ToastHost, useSheets, useToast } from "./ui/overlays";
import { Icon } from "./ui/Icon";
import { LoginView, NoAccess, Splash, Brand } from "./features/LoginView";
import { TodayView } from "./features/today/TodayView";
import { LogView } from "./features/log/LogView";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { SettingsSheet } from "./features/settings/SettingsSheet";
import { EmergencySheet } from "./features/EmergencySheet";
import { daysBetween, minutesOf } from "@shared/dates.ts";
import { itemState, leadRegimen, stepFor, therapyStart } from "@shared/plan.ts";
import type { Regimen } from "@shared/types.ts";

// Seltener genutzte Bereiche erst bei Bedarf laden (der Hintergrunddienst hält sie offline vor).
const StatsView = lazy(() => import("./features/stats/StatsView").then((m) => ({ default: m.StatsView })));
const RecordsView = lazy(() => import("./features/records/RecordsView").then((m) => ({ default: m.RecordsView })));
const AssistantView = lazy(() => import("./features/assistant/AssistantView").then((m) => ({ default: m.AssistantView })));

function ViewLoading() {
  return (
    <div className="view-loading" role="status">
      <span className="typing" /> Lädt …
    </div>
  );
}

type Tab = "heute" | "protokoll" | "verlauf" | "akte" | "claude";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "heute", label: "Heute", icon: "today" },
  { id: "protokoll", label: "Protokoll", icon: "log" },
  { id: "verlauf", label: "Verlauf", icon: "stats" },
  { id: "akte", label: "Akte", icon: "records" },
  { id: "claude", label: "Claude", icon: "claude" },
];

/** Gerät steht in einer anderen Zeitzone als Berlin: Uhr kennzeichnen. */
const OTHER_TZ = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === "Europe/Berlin") return false;
    const probe = new Date();
    const fmt = (zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(probe);
    return fmt(tz) !== fmt("Europe/Berlin");
  } catch {
    return false;
  }
})();

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#/, "");
  return (TABS.find((t) => t.id === h)?.id || "heute") as Tab;
}

declare global {
  interface Window {
    __spottyUpdate?: (reload?: boolean) => Promise<void>;
  }
}

export function App() {
  return (
    <ToastHost>
      <SessionProvider>
        <SheetHost>
          <Gate />
        </SheetHost>
      </SessionProvider>
    </ToastHost>
  );
}

function Gate() {
  const { ready, session } = useSession();
  const status = useStatus();
  const me = useMe();
  if (!ready) return <Splash />;
  if (!session) return <LoginView />;
  if (!status.loadedAt) {
    if (status.phase === "error") return <Splash error={status.error} onRetry={() => void store.reload()} />;
    return <Splash text="Lädt Spottys Daten …" />;
  }
  if (!me) return <NoAccess email={session.email} />;
  return <Shell />;
}

function subline(regs: Regimen[], day: string): string {
  const start = therapyStart(regs);
  if (!start) return "Pflege, Protokoll und Akte";
  const n = daysBetween(start, day) + 1;
  if (n < 1) return `Behandlung beginnt in ${1 - n} Tag${1 - n === 1 ? "" : "en"}`;
  const lead = leadRegimen(regs);
  const st = lead ? stepFor(lead, day) : null;
  return lead && st ? `Tag ${n} · ${lead.name.split(" ")[0]}${st.dose ? ` ${st.dose}` : ""}` : `Tag ${n} der Behandlung`;
}

// Zeitpunkt, zu dem diese Person das Protokoll zuletzt angesehen hat (je Gerät).
const SEEN_KEY = "spotty-seen-log";
function loadSeen(): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    if (v > 0) return v;
  } catch {
    /* Speicher gesperrt */
  }
  const n = Date.now();
  saveSeen(n);
  return n;
}
function saveSeen(v: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(v));
  } catch {
    /* Speicher gesperrt */
  }
}

/** Einträge und Fotos, die andere seit `since` angelegt haben. */
function freshByOthers<T extends { created_by?: string | null; created_at?: string }>(rows: T[], me: string | null | undefined, since: number): T[] {
  return rows.filter((r) => !!r.created_by && r.created_by !== me && Date.parse(r.created_at || "") > since);
}

/** Anzahl der heute seit mehr als 20 Minuten offenen Planpunkte (Medikamente, Pflege, Messungen). */
function useOverdue(now: { day: string; minutes: number }): number {
  const items = usePlan(now.day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  return useMemo(
    () => items.filter((it) => it.kind !== "foto" && minutesOf(it.time) <= now.minutes - 20 && !itemState(it, now.day, checks, entries, photos).done).length,
    [items, checks, entries, photos, now.day, now.minutes],
  );
}

function Shell() {
  const now = useNow();
  const status = useStatus();
  const regs = useRegimens();
  const sheets = useSheets();
  const toast = useToast();
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [day, setDay] = useState(now.day);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [visitedClaude, setVisitedClaude] = useState(tab === "claude");
  const [update, setUpdate] = useState(false);
  const lastToday = useRef(now.day);
  const me = useMe();
  const entries = useEntries();
  const photos = usePhotos();
  const seenRef = useRef<number>(0);
  if (!seenRef.current) seenRef.current = loadSeen();
  const [seenAt, setSeenAt] = useState<number>(seenRef.current);
  const [viewSince, setViewSince] = useState<number>(seenRef.current);
  const tabRef = useRef<Tab>(tab);
  const markSeen = useCallback(() => {
    const n = Date.now();
    seenRef.current = n;
    saveSeen(n);
    setSeenAt(n);
  }, []);

  // Um Mitternacht mit dem Kalender weiterspringen, wenn „heute“ angezeigt war.
  useEffect(() => {
    if (lastToday.current !== now.day) {
      setDay((d) => (d === lastToday.current ? now.day : d));
      lastToday.current = now.day;
    }
  }, [now.day]);

  const setTab = useCallback(
    (t: Tab) => {
      const prev = tabRef.current;
      tabRef.current = t;
      if (t === "protokoll" && prev !== "protokoll") setViewSince(seenRef.current);
      if (prev === "protokoll" && t !== "protokoll") markSeen();
      setTabState(t);
      if (t === "claude") setVisitedClaude(true);
      if (location.hash !== `#${t}`) history.replaceState(null, "", `#${t}`);
      window.scrollTo({ top: 0 });
    },
    [markSeen],
  );

  // Wer das Protokoll offen hat und die App verlässt, hat es gesehen.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && tabRef.current === "protokoll") markSeen();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markSeen]);

  const freshCount = useMemo(() => freshByOthers(entries, me?.user_id, seenAt).length + freshByOthers(photos, me?.user_id, seenAt).length, [entries, photos, me?.user_id, seenAt]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [setTab]);

  useEffect(() => store.onError((msg) => toast.show(msg, { error: true, ms: 6000 })), [toast]);

  useEffect(() => {
    const on = () => setUpdate(true);
    window.addEventListener("spotty-update", on);
    if ((window as unknown as { __spottyNeedsUpdate?: boolean }).__spottyNeedsUpdate) setUpdate(true);
    return () => window.removeEventListener("spotty-update", on);
  }, []);

  const runUpdate = update ? () => void window.__spottyUpdate?.(true) : null;
  const ask = useCallback(
    (p: string) => {
      setPrompt(p);
      setTab("claude");
    },
    [setTab],
  );

  const overdue = useOverdue(now);
  const sync = !status.online ? "offline" : status.pending ? "pending" : status.realtime === "SUBSCRIBED" ? "ok" : "";
  const syncText = !status.online ? "Offline – Änderungen werden nachgereicht" : status.pending ? `${status.pending} Änderung(en) werden gesendet` : status.realtime === "SUBSCRIBED" ? "Live verbunden" : "Verbindet …";

  return (
    <>
      <header className="app-header">
        <div className="wrap">
          <div className="brand">
            <Brand />
            <div className="brand-text">
              <div className="brand-name">Spotty</div>
              <div className="brand-sub">{subline(regs, now.day)}</div>
            </div>
          </div>
          <div className="clock" title={syncText} aria-label={`${now.hm} Uhr${OTHER_TZ ? " in Berlin" : ""}, ${syncText}`}>
            <span className={`sync-dot ${sync}`} />
            <span className="clock-stack">
              {now.hm}
              {OTHER_TZ ? <span className="tz">Berlin</span> : null}
            </span>
          </div>
          <button className="icon-btn danger" onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} aria-label="Notfall">
            <Icon name="phone" />
          </button>
          <button className="icon-btn" onClick={() => sheets.open((close) => <SettingsSheet onClose={close} onUpdate={runUpdate} />)} aria-label="Einstellungen">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className={`app-main wrap${tab === "verlauf" || tab === "akte" ? " wide" : ""}`}>
        {update ? (
          <div className="banner info" style={{ marginBottom: 14 }}>
            <div className="head">Neue Version verfügbar</div>
            <div className="row">
              <button className="btn small primary" onClick={() => void window.__spottyUpdate?.(true)}>
                Jetzt aktualisieren
              </button>
              <button className="btn small ghost" onClick={() => setUpdate(false)}>
                Später
              </button>
            </div>
          </div>
        ) : null}
        {!status.online ? (
          <p className="hint" style={{ marginBottom: 10 }}>
            Offline. Abhaken und Einträge funktionieren weiter und werden gesendet, sobald wieder Netz da ist.
          </p>
        ) : null}
        <ErrorBoundary label={`Der Bereich „${TABS.find((t) => t.id === tab)?.label || tab}“`} resetKey={tab}>
          <Suspense fallback={<ViewLoading />}>
            {tab === "heute" ? <TodayView day={day} now={now} onDay={setDay} onGoto={(t) => setTab(t as Tab)} /> : null}
            {tab === "protokoll" ? <LogView day={day} now={now} onDay={setDay} newSince={viewSince} /> : null}
            {tab === "verlauf" ? <StatsView now={now} onAsk={ask} /> : null}
            {tab === "akte" ? <RecordsView now={now} onAsk={ask} /> : null}
          </Suspense>
        </ErrorBoundary>
        {visitedClaude ? (
          <div hidden={tab !== "claude"}>
            <ErrorBoundary label="Der Bereich „Claude“">
              <Suspense fallback={<ViewLoading />}>
                <AssistantView prompt={prompt} onPromptUsed={() => setPrompt(null)} />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
      </main>

      <nav className="tabbar" aria-label="Bereiche">
        <div className="tabs" role="tablist">
          {TABS.map((t) => {
            const late = t.id === "heute" ? overdue : 0;
            const fresh = t.id === "protokoll" && tab !== "protokoll" ? freshCount : 0;
            const extra = [late ? `${late} überfällig` : "", fresh ? `${fresh} neu von anderen` : ""].filter(Boolean).join(", ");
            return (
              <button key={t.id} role="tab" aria-selected={tab === t.id} aria-label={extra ? `${t.label}, ${extra}` : undefined} className={`tab${t.id === "claude" ? " claude" : ""}`} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={24} />
                {late > 0 ? (
                  <span className="badge" aria-hidden="true">
                    {late}
                  </span>
                ) : null}
                {fresh > 0 ? (
                  <span className="badge new" aria-hidden="true">
                    {fresh > 99 ? "99+" : fresh}
                  </span>
                ) : null}
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
