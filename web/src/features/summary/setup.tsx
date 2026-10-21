// „Nutze Spotty bestmöglich“: Einrichtungsschritte als Karten und als Checkliste,
// dazu die Blätter „Bearbeiten“ für Schnell eintragen und Angepinnt.

import { useEffect, useState, type CSSProperties } from "react";
import { useProfile, useRegimens } from "../../lib/data";
import { useMe, useMembers } from "../../lib/session";
import { isIos, isStandalone, pushState, type PushState } from "../../lib/push";
import { IS_DEMO } from "../../lib/config";
import { clinicPhone } from "../../lib/profile";
import { navigate } from "../../lib/route";
import { Sheet, useSheets } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Group, Row, Switch } from "../../ui/ios";
import { TYPES, QUICK_ORDER } from "@shared/entryTypes.ts";
import { CATS, METRICS, catColor } from "../../lib/health/metrics";
import { quickStyle } from "../../lib/health/entryStyle";
import { ImportSheet } from "../settings/ImportSheet";
import { MembersSheet } from "../settings/MembersSheet";
import { PushPanel } from "../settings/PushPanel";
import { ProfileSheet } from "../records/ProfileSheet";
import { toggleQuick, togglePinned, usePinned, useQuick } from "../health/useHealth";

export interface SetupStep {
  key: string;
  done: boolean;
  title: string;
  text: string;
  glyph: string;
  color: string;
  action?: { label: string; run: () => void };
}

export function useSetupSteps(): { steps: SetupStep[]; ready: boolean } {
  const profile = useProfile();
  const regimens = useRegimens();
  const members = useMembers();
  const me = useMe();
  const sheets = useSheets();
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

  const admin = me?.role === "admin";
  const steps: SetupStep[] = [];
  if (admin)
    steps.push({
      key: "akte",
      done: !!profile && regimens.length > 0,
      title: "Akte importieren",
      text: "Die Datei spotty-akte.json einlesen. Danach stehen Plan, Befunde, Labor, Chronik und die bisherigen Protokolle in der App.",
      glyph: "doc",
      color: "var(--blue)",
      action: { label: "Datei wählen", run: () => sheets.open((close) => <ImportSheet onClose={close} />) },
    });
  steps.push({
    key: "notfall",
    done: !!clinicPhone(profile),
    title: "Notfallpass vervollständigen",
    text: "Mit der Nummer der Klinik und des Notdienstes stehen im Notfall die wichtigsten Angaben auf einen Blick bereit.",
    glyph: "phone",
    color: "var(--red)",
    action: { label: "Los geht’s", run: () => sheets.open((close) => <ProfileSheet profile={profile} onClose={close} />) },
  });
  if (admin)
    steps.push({
      key: "familie",
      done: members.length > 1,
      title: "Familie einladen",
      text: "Für jede Person ein Konto mit Startpasswort anlegen und die Zugangsdaten persönlich weitergeben.",
      glyph: "people",
      color: "var(--blue)",
      action: { label: "Mitglieder", run: () => sheets.open((close) => <MembersSheet onClose={close} />) },
    });
  steps.push({
    key: "home",
    done: isStandalone(),
    title: "Als App auf den Home-Bildschirm",
    text: isIos() ? "In Safari unten auf Teilen tippen und „Zum Home-Bildschirm“ wählen. Danach Spotty immer von dort öffnen." : "Im Browsermenü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.",
    glyph: "grid",
    color: "var(--c-bewegung)",
  });
  steps.push({
    key: "push",
    done: push === "on",
    title: "Erinnerungen einschalten",
    text: push === "ios-install" ? "Geht auf dem iPhone erst, wenn die App vom Home-Bildschirm geöffnet wird." : "Mitteilung zur Planzeit, auch wenn die App geschlossen ist. Jedes Gerät wählt selbst, welche Arten es bekommt.",
    glyph: "bell",
    color: "var(--red)",
    action:
      push === "ios-install"
        ? undefined
        : {
            label: "Einschalten",
            run: () =>
              sheets.open((close) => (
                <Sheet title="Erinnerungen" onClose={close} onDone={close} doneLabel="Fertig">
                  <div className="card">
                    <PushPanel />
                  </div>
                </Sheet>
              )),
          },
  });
  steps.push({
    key: "hilfe",
    done: false,
    title: "So funktioniert Spotty",
    text: "Zwei Minuten: was wo steht und wie man einträgt.",
    glyph: "book",
    color: "var(--c-medikamente)",
    action: { label: "Lesen", run: () => navigate("uebersicht/artikel/spotty") },
  });
  return { steps: IS_DEMO ? steps.filter((s) => s.key === "hilfe" || s.key === "notfall") : steps, ready: push !== null };
}

/** Checkliste aller Einrichtungsschritte, wie die Gesundheits-Checkliste. */
export function SetupSheet({ onClose }: { onClose: () => void }) {
  const { steps } = useSetupSteps();
  const list = steps.filter((s) => s.key !== "hilfe");
  const done = list.filter((s) => s.done).length;
  return (
    <Sheet title="Einrichtung" onClose={onClose} onDone={onClose} doneLabel="Fertig">
      <p className="sheet-lead center">
        {done} von {list.length} erledigt
      </p>
      <Group>
        {list.map((s) => (
          <Row
            key={s.key}
            glyph={s.done ? "checklist" : s.glyph}
            color={s.done ? "var(--green)" : s.color}
            title={s.title}
            sub={s.done ? "Erledigt" : s.text}
            wrap
            chevron={!s.done && !!s.action}
            onClick={!s.done && s.action ? s.action.run : undefined}
          />
        ))}
      </Group>
    </Sheet>
  );
}

/** Welche Knöpfe unter „Schnell eintragen“ erscheinen. */
export function QuickEditSheet({ onClose }: { onClose: () => void }) {
  const [quick] = useQuick();
  return (
    <Sheet title="Schnell eintragen" onClose={onClose} onDone={onClose} doneLabel="Fertig">
      <Group footer="Gilt für dieses Gerät.">
        {QUICK_ORDER.map((t) => {
          const st = quickStyle(t);
          return <Row key={t} glyph={st.glyph} color={st.color} title={TYPES[t].label} accessory={<Switch checked={quick.includes(t)} onChange={() => toggleQuick(t)} label={TYPES[t].label} />} />;
        })}
      </Group>
    </Sheet>
  );
}

/** Welche Messwerte unter „Angepinnt“ erscheinen. */
export function PinnedEditSheet({ onClose }: { onClose: () => void }) {
  const [pinned] = usePinned();
  return (
    <Sheet title="Angepinnt" onClose={onClose} onDone={onClose} doneLabel="Fertig">
      <p className="sheet-lead">Angepinnte Themen erscheinen in der Übersicht. Gilt für dieses Gerät.</p>
      {CATS.map((c) => {
        const ms = METRICS.filter((m) => m.cat === c.id);
        if (!ms.length) return null;
        return (
          <Group key={c.id} header={c.label}>
            {ms.map((m) => (
              <Row
                key={m.id}
                glyph={m.glyph}
                color={catColor(m.cat)}
                title={m.label}
                accessory={
                  <button type="button" className={`pinb${pinned.includes(m.id) ? " on" : ""}`} onClick={() => togglePinned(m.id)} aria-pressed={pinned.includes(m.id)} aria-label={`${m.label} anpinnen`} style={{ "--cat": catColor(m.cat) } as CSSProperties}>
                    <Glyph name="pin" size={26} />
                  </button>
                }
              />
            ))}
          </Group>
        );
      })}
    </Sheet>
  );
}
