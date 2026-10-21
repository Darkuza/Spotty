// Gerüst der App im Aufbau der Health-App: Anmeldung, zwei Reiter (Übersicht, Entdecken) in einer
// schwebenden Leiste, daneben Claude als runde Taste; Unterseiten über den Hash, Update-Hinweis in der Übersicht.

import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { SessionProvider, useMe, useSession } from "./lib/session";
import { store, useStatus } from "./lib/store";
import { useChecks, useEntries, usePhotos, usePlan } from "./lib/data";
import { NowProvider, useNowValue } from "./lib/now";
import { AskProvider } from "./lib/ask";
import { SheetHost, ToastHost, useToast } from "./ui/overlays";
import { Glyph } from "./ui/Glyph";
import { NavBar, Screen } from "./ui/ios";
import { LoginView, NoAccess, Splash } from "./features/LoginView";
import { SummaryView } from "./features/summary/SummaryView";
import { SimpleToday } from "./features/today/SimpleToday";
import { BrowseView } from "./features/browse/BrowseView";
import { CategoryPage } from "./features/health/CategoryPage";
import { MetricDataPage, MetricPage, MetricSourcesPage } from "./features/health/MetricPage";
import { AllDataPage, FamilyPage, HighlightsPage, TrendsPage } from "./features/health/ListPages";
import { TablePage } from "./features/health/TablePage";
import { ArticlePage, ArticlesPage } from "./features/articles/ArticlePages";
import { SourcesProvider } from "./features/health/useHealth";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { minutesOf } from "@shared/dates.ts";
import { itemState } from "@shared/plan.ts";
import { lastMoveKind, navigate, openTab, savedScroll, titleOf, useRoute, type Route, type Tab } from "./lib/route";
import { useViewMode } from "./lib/viewMode";

// Seltener genutzte Bereiche erst bei Bedarf laden (der Hintergrunddienst hält sie offline vor).
const AssistantView = lazy(() => import("./features/assistant/AssistantView").then((m) => ({ default: m.AssistantView })));
const RecordPage = lazy(() => import("./features/records/RecordPages").then((m) => ({ default: m.RecordPage })));
const MedsPage = lazy(() => import("./features/plan/MedsPage").then((m) => ({ default: m.MedsPage })));
const RegimenPage = lazy(() => import("./features/plan/RegimenPage").then((m) => ({ default: m.RegimenPage })));
const DayLogPage = lazy(() => import("./features/log/DayLogPage").then((m) => ({ default: m.DayLogPage })));

function ViewLoading() {
  return (
    <div className="view-loading" role="status">
      <span className="typing" /> Lädt …
    </div>
  );
}

const TABS: { id: Exclude<Tab, "claude">; label: string; glyph: string }[] = [
  { id: "uebersicht", label: "Übersicht", glyph: "heart" },
  { id: "entdecken", label: "Entdecken", glyph: "grid" },
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
  return (
    <NowProvider>
      <SourcesProvider>
        <AskProvider>
          <Shell />
        </AskProvider>
      </SourcesProvider>
    </NowProvider>
  );
}

/** Anzahl der heute seit mehr als 20 Minuten offenen Planpunkte (Medikamente, Pflege, Messungen). */
function useOverdue(): number {
  const now = useNowValue();
  const items = usePlan(now.day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  return useMemo(
    () => items.filter((it) => it.kind !== "foto" && minutesOf(it.time) <= now.minutes - 20 && !itemState(it, now.day, checks, entries, photos).done).length,
    [items, checks, entries, photos, now.day, now.minutes],
  );
}

function NotFound({ back }: { back: string }) {
  return (
    <Screen>
      <NavBar title="Nicht gefunden" back={back} />
      <p className="muted-c">Diese Seite gibt es nicht (mehr).</p>
    </Screen>
  );
}

function renderPage(route: Route, simple: boolean): ReactNode {
  const t = route.tab;
  const [a, b, c] = route.sub;
  if (t === "claude") return null;
  if (!a) return t === "uebersicht" ? simple ? <SimpleToday /> : <SummaryView /> : <BrowseView />;
  switch (a) {
    case "m":
      if (!b) break;
      if (c === "daten") return <MetricDataPage id={b} back={`${t}/m/${b}`} />;
      if (c === "quellen") return <MetricSourcesPage id={b} back={`${t}/m/${b}`} />;
      return <MetricPage id={b} back={t} />;
    case "k":
      return b ? <CategoryPage cat={b} back={t} /> : null;
    case "alle-daten":
      return <AllDataPage back={t} />;
    case "trends":
      return <TrendsPage back={t} />;
    case "highlights":
      return <HighlightsPage back={t} />;
    case "tabelle":
      return <TablePage back={t} />;
    case "protokoll":
      return <DayLogPage day={b} back={t} />;
    case "medikamente":
      return b ? <RegimenPage id={b} back={`${t}/medikamente`} /> : <MedsPage back={t} />;
    case "akte":
      return <RecordPage sub={route.sub.slice(1)} back={t} />;
    case "artikel":
      return b ? <ArticlePage id={b} back={`${t}/artikel`} /> : <ArticlesPage back={t} />;
    case "familie":
      return <FamilyPage back={t} />;
  }
  return <NotFound back={t} />;
}

function Shell() {
  const route = useRoute();
  const mode = useViewMode();
  const toast = useToast();
  const overdue = useOverdue();
  const [visitedClaude, setVisitedClaude] = useState(route.tab === "claude");

  useEffect(() => {
    if (route.tab === "claude") setVisitedClaude(true);
  }, [route.tab]);

  // Beim Zurückgehen an die alte Stelle, sonst nach oben.
  useLayoutEffect(() => {
    const kind = lastMoveKind();
    if (kind === "load") return;
    const y = kind === "back" || kind === "forward" ? savedScroll(route.path) : undefined;
    window.scrollTo({ top: y ?? 0 });
  }, [route.path]);

  useEffect(() => store.onError((msg) => toast.show(msg, { error: true, ms: 6000 })), [toast]);

  const simple = mode === "einfach" && route.path === "uebersicht";
  const isClaude = route.tab === "claude";
  const move = lastMoveKind();
  const page = renderPage(route, simple);

  return (
    <>
      <main className={`app-main${isClaude || simple ? " no-tabs" : ""}`}>
        {!isClaude ? (
          <ErrorBoundary label={`Der Bereich „${titleOf(route.path)}“`} resetKey={route.path}>
            <Suspense fallback={<ViewLoading />}>
              <div className="wrap pg-anim" data-move={move} key={route.path}>
                {page}
              </div>
            </Suspense>
          </ErrorBoundary>
        ) : null}
        {visitedClaude ? (
          <div hidden={!isClaude} className="wrap">
            <ErrorBoundary label="Der Bereich „Claude“">
              <Suspense fallback={<ViewLoading />}>
                <AssistantView />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
      </main>

      {!simple && !isClaude ? (
        <nav className="tabbar2" aria-label="Bereiche">
          <div className="tb-pill" role="tablist">
            {TABS.map((t) => {
              const late = t.id === "uebersicht" ? overdue : 0;
              return (
                <button key={t.id} type="button" role="tab" aria-selected={route.tab === t.id} aria-label={late ? `${t.label}, ${late} überfällig` : t.label} className="tb-item" onClick={() => openTab(t.id)}>
                  <span className="tb-ic">
                    <Glyph name={t.glyph} size={25} />
                    {late > 0 ? (
                      <span className="tb-badge" aria-hidden="true">
                        {late}
                      </span>
                    ) : null}
                  </span>
                  <span className="tb-l">{t.label}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="tb-acc" aria-label="Claude fragen" onClick={() => navigate("claude")}>
            <Glyph name="chat" size={25} />
          </button>
        </nav>
      ) : null}
    </>
  );
}
