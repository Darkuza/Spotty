// Profil hinter dem Profilbild: Spotty mit Gesundheitsdetails und Notfallpass, Familie, Erinnerungen,
// Behandlungsplan, Bericht, Daten, Darstellung, Konto und App.

import { useState } from "react";
import { backend, APP_VERSION, IS_DEMO } from "../../lib/config";
import { useMe, useSession } from "../../lib/session";
import { useStatus } from "../../lib/store";
import { useProfile } from "../../lib/data";
import { backupJson } from "../../lib/importer";
import { downloadText } from "../../lib/files";
import { getTheme, setTheme, type Theme } from "../../lib/theme";
import { setViewMode, useViewMode, type ViewMode } from "../../lib/viewMode";
import { navigate } from "../../lib/route";
import { runUpdate, useUpdate } from "../../lib/update";
import { useNowValue } from "../../lib/now";
import { Sheet, useConfirm, useSheets, useToast } from "../../ui/overlays";
import { TextField } from "../../ui/controls";
import { Group, Row, Segmented } from "../../ui/ios";
import { ageAt, todayKey } from "@shared/dates.ts";
import { PushPanel } from "../settings/PushPanel";
import { PlanSheet } from "../settings/PlanEditor";
import { MembersSheet } from "../settings/MembersSheet";
import { ImportSheet } from "../settings/ImportSheet";
import { ReportSheet } from "../stats/ReportSheet";
import { EmergencySheet } from "../EmergencySheet";

export function ProfileHub({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const { session } = useSession();
  const status = useStatus();
  const profile = useProfile();
  const sheets = useSheets();
  const confirm = useConfirm();
  const toast = useToast();
  const update = useUpdate();
  const now = useNowValue();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const viewMode = useViewMode();
  const isAdmin = me?.role === "admin";
  const d = profile?.data;
  const name = d?.name || "Spotty";
  const age = d?.born ? ageAt(d.born, now.day) : null;
  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Sheet title="Profil" onClose={onClose} onDone={onClose} doneLabel="Fertig" hideTitle>
      <div className="prof-head">
        <span className="avatar xl" aria-hidden="true">
          <span>{name.slice(0, 2).toUpperCase()}</span>
        </span>
        <p className="prof-name">{name}</p>
        <p className="prof-sub">{[d?.species, d?.breed, age ? `${age.years} Jahre` : ""].filter(Boolean).join(" · ") || "Profil"}</p>
      </div>

      <Group>
        <Row title="Gesundheitsdetails" chevron onClick={() => go("entdecken/akte/details")} />
        <Row title="Notfallpass" chevron onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} />
      </Group>

      <Group header="Familie und Erinnerungen">
        {isAdmin ? <Row title="Familie" sub="Zugänge anlegen und verwalten" chevron onClick={() => sheets.open((close) => <MembersSheet onClose={close} />)} /> : null}
        <Row
          title="Erinnerungen"
          sub="Mitteilungen auf diesem Gerät"
          chevron
          onClick={() =>
            sheets.open((close) => (
              <Sheet title="Erinnerungen" onClose={close} onDone={close} doneLabel="Fertig">
                <div className="card">
                  <PushPanel />
                </div>
              </Sheet>
            ))
          }
        />
      </Group>

      <Group header="Behandlung">
        <Row title="Behandlungsplan" sub="Medikamente, Uhrzeiten, Dosisstufen, Vorrat" chevron onClick={() => sheets.open((close) => <PlanSheet onClose={close} />)} />
        <Row title="Bericht für die Klinik" chevron onClick={() => sheets.open((close) => <ReportSheet now={now} onClose={close} />)} />
      </Group>

      <Group header="Daten">
        <Row title="Akte importieren" sub="Vorbereitete Akte-Datei einlesen" chevron onClick={() => sheets.open((close) => <ImportSheet onClose={close} />)} />
        <Row
          title="Sicherung herunterladen"
          sub="Alle Einträge als JSON-Datei, ohne Fotos und PDFs"
          chevron
          onClick={() => {
            downloadText(`spotty-sicherung-${todayKey()}.json`, backupJson(), "application/json");
            toast.show("Sicherung erstellt");
          }}
        />
      </Group>

      <Group header="Darstellung" footer="„Einfach“ zeigt in der Übersicht nur den nächsten Schritt mit großen Tasten, das Befinden, den Tagesablauf und das Foto vom Papierprotokoll.">
        <div className="grp-pad">
          <span className="grp-lab">Farbschema</span>
          <Segmented<Theme>
            label="Farbschema"
            value={theme}
            onChange={(t) => {
              setTheme(t);
              setThemeState(t);
            }}
            options={[
              ["system", "Wie Gerät"],
              ["light", "Hell"],
              ["dark", "Dunkel"],
            ]}
          />
        </div>
        <div className="grp-pad">
          <span className="grp-lab">Ansicht auf diesem Gerät</span>
          <Segmented<ViewMode>
            label="Ansicht auf diesem Gerät"
            value={viewMode}
            onChange={(m) => {
              setViewMode(m);
              if (m === "einfach") go("uebersicht");
            }}
            options={[
              ["voll", "Ausführlich"],
              ["einfach", "Einfach"],
            ]}
          />
        </div>
      </Group>

      <Group header="Hilfe">
        <Row title="So funktioniert Spotty" chevron onClick={() => go("uebersicht/artikel/spotty")} />
        <Row title="Alle Artikel" chevron onClick={() => go("uebersicht/artikel")} />
      </Group>

      <Group header="Konto">
        <Row title={me?.name || "–"} sub={`${session?.email || ""} · ${isAdmin ? "Admin" : "Mitglied"}`} />
        <Row title="Passwort ändern" chevron onClick={() => !IS_DEMO && sheets.open((close) => <PasswordSheet onClose={close} />)} />
        <Row
          title="Abmelden"
          tone="red"
          onClick={async () => {
            if (await confirm({ title: "Auf diesem Gerät abmelden?", text: status.pending ? `${status.pending} Änderung(en) sind noch nicht gesendet; sie werden bei der nächsten Anmeldung auf diesem Gerät nachgereicht.` : undefined, confirm: "Abmelden", danger: true })) {
              await backend.signOut();
              onClose();
            }
          }}
        />
      </Group>

      <Group header="App" footer={status.error ? `Letzter Fehler: ${status.error}` : "Spotty · Pflege, Protokoll und Akte"}>
        <Row title="Version" value={APP_VERSION} />
        <Row
          title="Verbindung"
          value={`${!status.online ? "offline" : status.realtime === "SUBSCRIBED" ? "live" : status.realtime ? status.realtime.toLowerCase() : "verbindet …"}${status.pending ? ` · ${status.pending} warten` : ""}`}
        />
        {IS_DEMO ? <Row title="Modus" value="Demo" /> : null}
        {update.available ? (
          <Row title="Update installieren" tone="blue" onClick={runUpdate} />
        ) : (
          <Row
            title="Nach Update suchen"
            tone="blue"
            onClick={async () => {
              const reg = await navigator.serviceWorker?.getRegistration();
              await reg?.update().catch(() => undefined);
              toast.show(reg ? "Nach Updates gesucht" : "Kein Hintergrunddienst aktiv");
            }}
          />
        )}
        <Row title="Neu laden" tone="blue" onClick={() => location.reload()} />
      </Group>
    </Sheet>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = pw.length >= 8 && pw === pw2;
  const save = async () => {
    if (!valid || busy) return;
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
  };
  return (
    <Sheet title="Passwort ändern" onClose={onClose} onDone={() => void save()} doneDisabled={!valid || busy} doneLabel="Speichern">
      <div className="card form">
        <TextField label="Neues Passwort (mind. 8 Zeichen)" value={pw} onChange={setPw} type="password" autoComplete="new-password" />
        <TextField label="Wiederholen" value={pw2} onChange={setPw2} type="password" autoComplete="new-password" hint={pw2 && pw !== pw2 ? "Die Eingaben stimmen nicht überein." : undefined} />
      </div>
    </Sheet>
  );
}
