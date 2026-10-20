// Gerüst der App: Anmeldung, Kopfzeile mit Uhr und Notfall-Taste, fünf Reiter, Update-Hinweis.

import { useCallback, useEffect, useRef, useState } from "react";
import { SessionProvider, useMe, useSession } from "./lib/session";
import { store, useStatus } from "./lib/store";
import { useNow } from "./lib/hooks";
import { useRegimens } from "./lib/data";
import { SheetHost, ToastHost, useSheets, useToast } from "./ui/overlays";
import { Icon } from "./ui/Icon";
import { LoginView, NoAccess, Splash, Brand } from "./features/LoginView";
import { TodayView } from "./features/today/TodayView";
import { LogView } from "./features/log/LogView";
import { StatsView } from "./features/stats/StatsView";
import { RecordsView } from "./features/records/RecordsView";
import { AssistantView } from "./features/assistant/AssistantView";
import { SettingsSheet } from "./features/settings/SettingsSheet";
import { EmergencySheet } from "./features/EmergencySheet";
import { daysBetween } from "@shared/dates.ts";
import { leadRegimen, stepFor, therapyStart } from "@shared/plan.ts";
import type { Regimen } from "@shared/types.ts";

type Tab = "heute" | "protokoll" | "verlauf" | "akte" | "claude";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "heute", label: "Heute", icon: "today" },
  { id: "protokoll", label: "Protokoll", icon: "log" },
  { id: "verlauf", label: "Verlauf", icon: "stats" },
  { id: "akte", label: "Akte", icon: "records" },
  { id: "claude", label: "Claude", icon: "claude" },
];

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

  // Um Mitternacht mit dem Kalender weiterspringen, wenn „heute“ angezeigt war.
  useEffect(() => {
    if (lastToday.current !== now.day) {
      setDay((d) => (d === lastToday.current ? now.day : d));
      lastToday.current = now.day;
    }
  }, [now.day]);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    if (t === "claude") setVisitedClaude(true);
    if (location.hash !== `#${t}`) history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0 });
  }, []);

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
          <div className="clock" title={syncText} aria-label={`${now.hm} Uhr, ${syncText}`}>
            <span className={`sync-dot ${sync}`} />
            {now.hm}
          </div>
          <button className="icon-btn danger" onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} aria-label="Notfall">
            <Icon name="phone" />
          </button>
          <button className="icon-btn" onClick={() => sheets.open((close) => <SettingsSheet onClose={close} onUpdate={runUpdate} />)} aria-label="Einstellungen">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="app-main wrap">
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
        {tab === "heute" ? <TodayView day={day} now={now} onDay={setDay} onGoto={(t) => setTab(t as Tab)} /> : null}
        {tab === "protokoll" ? <LogView day={day} now={now} onDay={setDay} /> : null}
        {tab === "verlauf" ? <StatsView now={now} onAsk={ask} /> : null}
        {tab === "akte" ? <RecordsView now={now} onAsk={ask} /> : null}
        {visitedClaude ? (
          <div hidden={tab !== "claude"}>
            <AssistantView prompt={prompt} onPromptUsed={() => setPrompt(null)} />
          </div>
        ) : null}
      </main>

      <nav className="tabbar" aria-label="Bereiche">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${t.id === "claude" ? " claude" : ""}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={24} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
