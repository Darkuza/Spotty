// Einrichtung beim ersten Start: Akte, Familie, Home-Bildschirm, Erinnerungen, Kurzanleitung.

import { useEffect, useState } from "react";
import { useProfile, useRegimens } from "../../lib/data";
import { useMe, useMembers } from "../../lib/session";
import { useLocalState } from "../../lib/hooks";
import { isIos, isStandalone, pushState, type PushState } from "../../lib/push";
import { IS_DEMO } from "../../lib/config";
import { Sheet, useSheets } from "../../ui/overlays";
import { Icon } from "../../ui/Icon";
import { ImportSheet } from "../settings/ImportSheet";
import { MembersSheet } from "../settings/MembersSheet";
import { PushPanel } from "../settings/PushPanel";
import { HelpSheet } from "../HelpSheet";

interface Step {
  key: string;
  done: boolean;
  title: string;
  text: string;
  action?: () => void;
  actionLabel?: string;
}

export function SetupCard() {
  const profile = useProfile();
  const regimens = useRegimens();
  const members = useMembers();
  const me = useMe();
  const sheets = useSheets();
  const [dismissed, setDismissed] = useLocalState<boolean>("spotty-setup-dismissed", false);
  const [helpSeen, setHelpSeen] = useLocalState<boolean>("spotty-help-seen", false);
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => void pushState().then((s) => alive && setPush(s));
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (dismissed || IS_DEMO) return null;
  const admin = me?.role === "admin";
  const standalone = isStandalone();
  const steps: Step[] = [];
  if (admin)
    steps.push({
      key: "akte",
      done: !!profile && regimens.length > 0,
      title: "Akte importieren",
      text: "Die Datei spotty-akte.json einlesen. Danach stehen Plan, Befunde, Labor, Chronik und die bisherigen Protokolle in der App.",
      action: () => sheets.open((close) => <ImportSheet onClose={close} />),
      actionLabel: "Datei wählen",
    });
  if (admin)
    steps.push({
      key: "familie",
      done: members.length > 1,
      title: "Familie einladen",
      text: "Für jede Person ein Konto mit Startpasswort anlegen und die Zugangsdaten persönlich weitergeben.",
      action: () => sheets.open((close) => <MembersSheet onClose={close} />),
      actionLabel: "Mitglieder",
    });
  steps.push({
    key: "home",
    done: standalone,
    title: "Als App auf den Home-Bildschirm",
    text: isIos() ? "In Safari unten auf Teilen tippen und „Zum Home-Bildschirm“ wählen. Danach Spotty immer von dort öffnen." : "Im Browsermenü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.",
  });
  steps.push({
    key: "push",
    done: push === "on",
    title: "Erinnerungen einschalten",
    text: push === "ios-install" ? "Geht auf dem iPhone erst, wenn die App vom Home-Bildschirm geöffnet wird." : "Mitteilung zur Planzeit, auch wenn die App geschlossen ist. Jedes Gerät wählt selbst, welche Arten es bekommt.",
    action:
      push === "ios-install"
        ? undefined
        : () =>
            sheets.open((close) => (
              <Sheet title="Erinnerungen" onClose={close}>
                <PushPanel />
              </Sheet>
            )),
    actionLabel: "Einschalten",
  });
  steps.push({
    key: "hilfe",
    done: helpSeen,
    title: "Kurzanleitung",
    text: "Zwei Minuten: was wo steht und wie man einträgt.",
    action: () => {
      setHelpSeen(true);
      sheets.open((close) => <HelpSheet onClose={close} />);
    },
    actionLabel: "Lesen",
  });

  const open = steps.filter((s) => !s.done);
  if (!open.length || push === null) return null;
  const doneCount = steps.length - open.length;

  return (
    <section className="card stack-s setup" aria-label="Einrichtung">
      <div className="row between">
        <b>Einrichtung</b>
        <span className="muted small num">
          {doneCount} von {steps.length}
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="setup-list">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? "done" : ""}>
            <span className="mark" aria-hidden="true">
              {s.done ? <Icon name="check" size={16} stroke={2.6} /> : null}
            </span>
            <span className="grow">
              <b>{s.title}</b>
              {!s.done ? <span className="hint">{s.text}</span> : null}
            </span>
            {!s.done && s.action ? (
              <button className="btn small ghost" onClick={s.action}>
                {s.actionLabel || "Öffnen"}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <button className="link-btn" style={{ alignSelf: "flex-start" }} onClick={() => setDismissed(true)}>
        Ausblenden
      </button>
    </section>
  );
}
