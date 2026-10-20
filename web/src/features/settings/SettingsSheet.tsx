// Einstellungen: Konto, Erinnerungen, Behandlungsplan, Mitglieder, Daten, Darstellung, Version.

import { useState } from "react";
import { backend, APP_VERSION, IS_DEMO } from "../../lib/config";
import { useMe, useSession } from "../../lib/session";
import { useStatus } from "../../lib/store";
import { backupJson } from "../../lib/importer";
import { downloadText } from "../../lib/files";
import { getTheme, setTheme, type Theme } from "../../lib/theme";
import { Sheet, useConfirm, useSheets, useToast } from "../../ui/overlays";
import { Seg, TextField } from "../../ui/controls";
import { Icon } from "../../ui/Icon";
import { PushPanel } from "./PushPanel";
import { PlanSheet } from "./PlanEditor";
import { MembersSheet } from "./MembersSheet";
import { ImportSheet } from "./ImportSheet";
import { HelpSheet } from "../HelpSheet";
import { todayKey } from "@shared/dates.ts";

function NavRow({ icon, label, hint, onClick }: { icon: string; label: string; hint?: string; onClick: () => void }) {
  return (
    <button className="erow" style={{ gridTemplateColumns: "28px minmax(0,1fr) auto", alignItems: "center" }} onClick={onClick}>
      <Icon name={icon} />
      <span>
        <span className="s" style={{ display: "block" }}>
          {label}
        </span>
        {hint ? (
          <span className="x" style={{ display: "block" }}>
            {hint}
          </span>
        ) : null}
      </span>
      <Icon name="right" size={20} />
    </button>
  );
}

export function SettingsSheet({ onClose, onUpdate }: { onClose: () => void; onUpdate: (() => void) | null }) {
  const me = useMe();
  const { session } = useSession();
  const status = useStatus();
  const sheets = useSheets();
  const confirm = useConfirm();
  const toast = useToast();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const isAdmin = me?.role === "admin";

  return (
    <Sheet title="Einstellungen" onClose={onClose}>
      <div className="section-title">
        <h2>Konto</h2>
      </div>
      <div className="card stack-s">
        <div className="row between">
          <span>
            <b>{me?.name || "–"}</b>
            <span className="muted small" style={{ display: "block", overflowWrap: "anywhere" }}>
              {session?.email} · {isAdmin ? "Admin" : "Mitglied"}
            </span>
          </span>
        </div>
        <div className="grid-2">
          <button className="btn ghost small" onClick={() => sheets.open((close) => <PasswordSheet onClose={close} />)} disabled={IS_DEMO}>
            Passwort ändern
          </button>
          <button
            className="btn ghost small"
            onClick={async () => {
              if (await confirm({ title: "Auf diesem Gerät abmelden?", text: status.pending ? `${status.pending} Änderung(en) sind noch nicht gesendet; sie werden bei der nächsten Anmeldung auf diesem Gerät nachgereicht.` : undefined, confirm: "Abmelden" })) {
                await backend.signOut();
                onClose();
              }
            }}
          >
            Abmelden
          </button>
        </div>
      </div>

      <div className="section-title">
        <h2>Erinnerungen</h2>
      </div>
      <div className="card">
        <PushPanel />
      </div>

      <div className="section-title">
        <h2>Verwaltung</h2>
      </div>
      <div className="card flush">
        <NavRow icon="file" label="Kurzanleitung" hint="Was wo steht und wie man einträgt" onClick={() => sheets.open((close) => <HelpSheet onClose={close} />)} />
        <NavRow icon="pill" label="Behandlungsplan" hint="Medikamente, Uhrzeiten, Dosisstufen, Vorrat" onClick={() => sheets.open((close) => <PlanSheet onClose={close} />)} />
        {isAdmin ? <NavRow icon="user" label="Mitglieder" hint="Zugänge für die Familie" onClick={() => sheets.open((close) => <MembersSheet onClose={close} />)} /> : null}
        <NavRow icon="upload" label="Akte importieren" hint="Vorbereitete Akte-Datei einlesen" onClick={() => sheets.open((close) => <ImportSheet onClose={close} />)} />
        <NavRow
          icon="download"
          label="Sicherung herunterladen"
          hint="Alle Einträge als JSON-Datei (ohne Fotos und PDFs)"
          onClick={() => {
            downloadText(`spotty-sicherung-${todayKey()}.json`, backupJson(), "application/json");
            toast.show("Sicherung erstellt");
          }}
        />
      </div>

      <div className="section-title">
        <h2>Darstellung</h2>
      </div>
      <Seg<Theme>
        label="Farbschema"
        value={theme}
        onChange={(t) => {
          setTheme(t);
          setThemeState(t);
        }}
        options={[
          ["system", "wie Gerät"],
          ["light", "hell"],
          ["dark", "dunkel"],
        ]}
      />

      <div className="section-title">
        <h2>App</h2>
      </div>
      <div className="card stack-s">
        <dl className="kv">
          <dt>Version</dt>
          <dd className="mono small">{APP_VERSION}</dd>
          <dt>Verbindung</dt>
          <dd>
            {!status.online ? "offline" : status.realtime === "SUBSCRIBED" ? "live" : status.realtime ? status.realtime.toLowerCase() : "verbindet …"}
            {status.pending ? ` · ${status.pending} Änderung(en) warten` : ""}
          </dd>
          {IS_DEMO ? (
            <>
              <dt>Modus</dt>
              <dd>Demo (Daten nur in diesem Browser)</dd>
            </>
          ) : null}
        </dl>
        {status.error ? <p className="hint">Letzter Fehler: {status.error}</p> : null}
        <div className="grid-2">
          {onUpdate ? (
            <button className="btn primary small" onClick={onUpdate}>
              Update installieren
            </button>
          ) : (
            <button
              className="btn ghost small"
              onClick={async () => {
                const reg = await navigator.serviceWorker?.getRegistration();
                await reg?.update().catch(() => undefined);
                toast.show(reg ? "Nach Updates gesucht" : "Kein Hintergrunddienst aktiv");
              }}
            >
              Nach Update suchen
            </button>
          )}
          <button className="btn ghost small" onClick={() => location.reload()}>
            Neu laden
          </button>
        </div>
      </div>
      <p className="hint" style={{ textAlign: "center" }}>
        Spotty · Pflege, Protokoll und Akte
      </p>
    </Sheet>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = pw.length >= 8 && pw === pw2;
  return (
    <Sheet
      title="Passwort ändern"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={!valid || busy}
            style={{ flex: 2 }}
            onClick={async () => {
              setBusy(true);
              try {
                await backend.changePassword(pw);
                toast.show("Passwort geändert");
                onClose();
              } catch (e) {
                toast.show(e instanceof Error ? e.message : String(e), { error: true });
              } finally {
                setBusy(false);
              }
            }}
          >
            Speichern
          </button>
        </>
      }
    >
      <TextField label="Neues Passwort (mind. 8 Zeichen)" value={pw} onChange={setPw} type="password" autoComplete="new-password" />
      <TextField label="Wiederholen" value={pw2} onChange={setPw2} type="password" autoComplete="new-password" hint={pw2 && pw !== pw2 ? "Die Eingaben stimmen nicht überein." : undefined} />
    </Sheet>
  );
}
