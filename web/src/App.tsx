// Gerüst der App: Anmeldung, Seiten mit eigenem Kopf, fünf Reiter, Unterseiten über den Hash, Update-Hinweis.

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SessionProvider, useMe, useSession } from "./lib/session";
import { store, useStatus } from "./lib/store";
import { useNow } from "./lib/hooks";
import { useChecks, useEntries, usePhotos, usePlan } from "./lib/data";
import { SheetHost, ToastHost, useToast } from "./ui/overlays";
import { Icon } from "./ui/Icon";
import { PageHeader } from "./ui/Page";
import { LoginView, NoAccess, Splash } from "./features/LoginView";
import { TodayView } from "./features/today/TodayView";
import { SimpleToday } from "./features/today/SimpleToday";
import { LogView } from "./features/log/LogView";
import { HeaderActions } from "./features/common";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { isFreshFor } from "./lib/fresh";
import { minutesOf } from "@shared/dates.ts";
import { itemState } from "@shared/plan.ts";
import { lastMoveKind, navigate, openTab, savedScroll, titleOf, useRoute, type Tab } from "./lib/route";
import { useViewMode } from "./lib/viewMode";
import { dismissUpdate, runUpdate, useUpdate } from "./lib/update";

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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "heute", label: "Heute", icon: "today" },
  { id: "protokoll", label: "Protokoll", icon: "log" },
  { id: "verlauf", label: "Verlauf", icon: "stats" },
  { id: "akte", label: "Akte", icon: "records" },
  { id: "claude", label: "Claude", icon: "claude" },
];

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

function freshByOthers<T extends Parameters<typeof isFreshFor>[0]>(rows: T[], me: string | null | undefined, since: number): T[] {
  return rows.filter((r) => isFreshFor(r, me, since));
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
  const route = useRoute();
  const mode = useViewMode();
  const update = useUpdate();
  const toast = useToast();
  const [day, setDay] = useState(now.day);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [visitedClaude, setVisitedClaude] = useState(route.tab === "claude");
  const lastToday = useRef(now.day);
  const me = useMe();
  const entries = useEntries();
  const photos = usePhotos();
  const seenRef = useRef<number>(0);
  if (!seenRef.current) seenRef.current = loadSeen();
  const [seenAt, setSeenAt] = useState<number>(seenRef.current);
  const [viewSince, setViewSince] = useState<number>(seenRef.current);
  const tabRef = useRef<Tab | null>(route.tab);
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

  // Protokoll betreten: „neu seit“ festhalten; verlassen: als gesehen merken.
  useEffect(() => {
    const prev = tabRef.current;
    const t = route.tab;
    tabRef.current = t;
    if (t === "protokoll" && prev !== "protokoll") setViewSince(seenRef.current);
    if (prev === "protokoll" && t !== "protokoll") markSeen();
    if (t === "claude") setVisitedClaude(true);
  }, [route.tab, markSeen]);

  // Beim Zurückgehen an die alte Stelle, sonst nach oben.
  useLayoutEffect(() => {
    const kind = lastMoveKind();
    if (kind === "load") return;
    const y = kind === "back" || kind === "forward" ? savedScroll(route.path) : undefined;
    window.scrollTo({ top: y ?? 0 });
  }, [route.path]);

  // Wer das Protokoll offen hat und die App verlässt, hat es gesehen.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && tabRef.current === "protokoll") markSeen();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markSeen]);

  const freshCount = useMemo(() => freshByOthers(entries, me?.user_id, seenAt).length + freshByOthers(photos, me?.user_id, seenAt).length, [entries, photos, me?.user_id, seenAt]);

  useEffect(() => store.onError((msg) => toast.show(msg, { error: true, ms: 6000 })), [toast]);

  const ask = useCallback((p: string) => {
    setPrompt(p);
    navigate("claude");
  }, []);

  const overdue = useOverdue(now);
  const simple = mode === "einfach" && route.path === "heute";
  const wide = route.tab === "verlauf" || route.tab === "akte";

  return (
    <>
      <main className={`app-main wrap${wide ? " wide" : ""}${simple ? " no-tabs" : ""}`}>
        {update.available && !update.dismissed ? (
          <div className="note col tone-blue" style={{ marginTop: 14 }}>
            <div className="note-head">Neue Version verfügbar</div>
            <div className="note-actions">
              <button className="btn small primary" onClick={runUpdate}>
                Jetzt aktualisieren
              </button>
              <button className="btn small" onClick={dismissUpdate}>
                Später
              </button>
            </div>
          </div>
        ) : null}
        <ErrorBoundary label={`Der Bereich „${titleOf(route.path)}“`} resetKey={route.path}>
          <Suspense fallback={<ViewLoading />}>
            {route.tab === "heute" ? simple ? <SimpleToday now={now} /> : <TodayView day={day} now={now} onDay={setDay} /> : null}
            {route.tab === "protokoll" ? <LogView day={day} now={now} onDay={setDay} newSince={viewSince} /> : null}
            {route.tab === "verlauf" ? (
              <div className="page">
                <PageHeader title="Verlauf" actions={<HeaderActions />} />
                <div className="blk">
                  <StatsView now={now} onAsk={ask} />
                </div>
              </div>
            ) : null}
            {route.tab === "akte" ? (
              <div className="page">
                <PageHeader title="Akte" actions={<HeaderActions />} />
                <div className="blk">
                  <RecordsView now={now} onAsk={ask} />
                </div>
              </div>
            ) : null}
          </Suspense>
        </ErrorBoundary>
        {visitedClaude ? (
          <div hidden={route.tab !== "claude"}>
            <ErrorBoundary label="Der Bereich „Claude“">
              <Suspense fallback={<ViewLoading />}>
                <div className="page">
                  <PageHeader title="Claude" actions={<HeaderActions />} />
                  <div className="blk">
                    <AssistantView prompt={prompt} onPromptUsed={() => setPrompt(null)} />
                  </div>
                </div>
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
      </main>

      {!simple ? (
        <nav className="tabbar" aria-label="Bereiche">
          <div className="tabs" role="tablist">
            {TABS.map((t) => {
              const late = t.id === "heute" ? overdue : 0;
              const fresh = t.id === "protokoll" && route.tab !== "protokoll" ? freshCount : 0;
              const extra = [late ? `${late} überfällig` : "", fresh ? `${fresh} neu von anderen` : ""].filter(Boolean).join(", ");
              return (
                <button key={t.id} role="tab" aria-selected={route.tab === t.id} aria-label={extra ? `${t.label}, ${extra}` : undefined} className="tab" onClick={() => openTab(t.id)}>
                  <Icon name={t.icon} size={24} stroke={1.9} />
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
      ) : null}
    </>
  );
}

