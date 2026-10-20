// Erinnerungen auf diesem Gerät: einschalten, Arten wählen, Probe senden.

import { useEffect, useState } from "react";
import { DEFAULT_PREFS, disablePush, enablePush, loadPrefs, pushState, savePrefs, testPush, type PushPrefs, type PushState } from "../../lib/push";
import { IS_DEMO } from "../../lib/config";
import { Toggle } from "../../ui/controls";
import { useToast } from "../../ui/overlays";

const LABELS: [keyof PushPrefs, string, string?][] = [
  ["med", "Medikamente"],
  ["inh", "Inhalation"],
  ["mess", "Messungen", "Atemzüge, SpO₂, Gewicht"],
  ["foto", "Protokollfoto am Abend"],
  ["feed", "Mahlzeiten"],
  ["overdue", "Nachfassen", "Wenn ein Medikament 30 Minuten nach der Zeit noch nicht abgehakt ist"],
];

export function PushPanel() {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const s = await pushState();
      if (!alive) return;
      setState(s);
      if (s === "on") setPrefs(await loadPrefs());
    })();
    return () => {
      alive = false;
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e), { error: true, ms: 6000 });
    } finally {
      setBusy(false);
      setState(await pushState());
    }
  };

  if (state === null) return <p className="hint">Prüfe Mitteilungen …</p>;
  if (IS_DEMO) return <p className="hint">Im Demo-Modus gibt es keine Erinnerungen.</p>;
  if (state === "ios-install")
    return (
      <div className="stack-s">
        <p>Auf dem iPhone kommen Erinnerungen nur, wenn die App auf dem Home-Bildschirm liegt.</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>In Safari unten auf Teilen tippen.</li>
          <li>„Zum Home-Bildschirm“ wählen.</li>
          <li>Spotty vom Home-Bildschirm öffnen und hier Erinnerungen einschalten.</li>
        </ol>
      </div>
    );
  if (state === "unsupported") return <p className="hint">Dieser Browser unterstützt keine Push-Mitteilungen.</p>;
  if (state === "denied") return <p className="hint">Mitteilungen sind für Spotty in den Geräteeinstellungen blockiert. Dort erlauben, dann hier einschalten.</p>;

  const on = state === "on";
  return (
    <div className="stack-s">
      <Toggle
        label="Erinnerungen auf diesem Gerät"
        hint={on ? "Kommen zur Planzeit, auch wenn die App geschlossen ist." : "Zur Planzeit eine Mitteilung bekommen."}
        checked={on}
        onChange={(v) => void run(async () => (v ? enablePush(prefs) : disablePush()))}
      />
      {on ? (
        <>
          {LABELS.map(([k, label, hint]) => (
            <Toggle
              key={k}
              label={label}
              hint={hint}
              checked={prefs[k]}
              onChange={(v) => {
                const next = { ...prefs, [k]: v };
                setPrefs(next);
                savePrefs(next).catch((e) => toast.show(e instanceof Error ? e.message : String(e), { error: true }));
              }}
            />
          ))}
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const n = await testPush();
                toast.show(n ? "Probe gesendet" : "Kein Gerät erreicht");
              })
            }
          >
            Probe senden
          </button>
        </>
      ) : null}
    </div>
  );
}
