// Akte importieren: vorbereitete Datei einlesen, Inhalt prüfen, in die Datenbank übertragen.

import { useRef, useState } from "react";
import { bundleCounts, importBundle, parseBundle, type Bundle, type ImportSummary } from "../../lib/importer";
import { Sheet, useToast } from "../../ui/overlays";
import { Toggle } from "../../ui/controls";
import { Icon } from "../../ui/Icon";
import { fmtBytes } from "../../lib/files";

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function ImportSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [fileInfo, setFileInfo] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [progress, setProgress] = useState<{ text: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setResult(null);
    try {
      const text = await f.text();
      setBundle(parseBundle(text));
      setFileInfo(`${f.name} · ${fmtBytes(f.size)}`);
    } catch (e) {
      setBundle(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async () => {
    if (!bundle) return;
    setError(null);
    try {
      const r = await importBundle(bundle, overwrite, (text, done, total) => setProgress({ text, done, total }));
      setResult(r);
      toast.show("Akte importiert");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const c = bundle ? bundleCounts(bundle) : null;
  return (
    <Sheet
      title="Akte importieren"
      onClose={progress ? () => undefined : onClose}
      footer={
        result ? (
          <button className="btn primary" onClick={onClose}>
            Fertig
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose} disabled={!!progress}>
              Abbrechen
            </button>
            <button className="btn primary" onClick={() => void run()} disabled={!bundle || !!progress} style={{ flex: 2 }}>
              {progress ? "Importiert …" : "Importieren"}
            </button>
          </>
        )
      }
    >
      <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {!result ? (
        <>
          <p className="small">Die Akte-Datei (spotty-akte….json) enthält Stammdaten, Behandlungsplan, Befunde mit Originaldateien, Laborwerte, Chronik, Fragen und die bisherigen Protokolle. Sie wird einmal eingelesen und danach in der App gepflegt.</p>
          <button className="btn ghost block" onClick={() => inputRef.current?.click()} disabled={!!progress}>
            <Icon name="file" size={20} /> {bundle ? "Andere Datei wählen" : "Datei wählen"}
          </button>
        </>
      ) : null}
      {error ? (
        <div className="banner warn">
          <div className="head">Import nicht möglich</div>
          <p>{error}</p>
        </div>
      ) : null}
      {bundle && c && !result ? (
        <div className="card stack-s">
          <b>{fileInfo}</b>
          {bundle.created ? <p className="hint">erstellt {new Date(bundle.created).toLocaleString("de-DE")}</p> : null}
          <dl className="kv">
            <dt>Dokumente</dt>
            <dd>
              {c.documents} ({c.files} Dateien)
            </dd>
            <dt>Laborwerte</dt>
            <dd>{c.labs}</dd>
            <dt>Chronik</dt>
            <dd>{c.events}</dd>
            <dt>Fragen</dt>
            <dd>{c.questions}</dd>
            <dt>Protokoll</dt>
            <dd>
              {c.entries} Einträge, {c.photos} Fotos{c.checks ? `, ${c.checks} abgehakte Planpunkte` : ""}
            </dd>
            <dt>Plan</dt>
            <dd>{c.regimens} Punkte</dd>
          </dl>
          <Toggle
            label="Vorhandenes überschreiben"
            hint={overwrite ? "Was in der App seitdem geändert wurde (z. B. Antworten auf Fragen, geänderte Dosen), wird durch die Datei ersetzt." : "Nur Neues kommt hinzu; was es schon gibt, bleibt unverändert."}
            checked={overwrite}
            onChange={setOverwrite}
          />
        </div>
      ) : null}
      {progress ? (
        <div className="stack-s">
          <p className="small">
            {progress.text}
            {progress.total > 1 ? ` · ${progress.done}/${progress.total}` : ""}
          </p>
          <div className="progress">
            <i style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
          <p className="hint">Bitte die App geöffnet lassen, bis der Import fertig ist.</p>
        </div>
      ) : null}
      {result ? (
        <div className="card stack-s">
          <b>Übernommen</b>
          <p className="small">
            {[
              result.profile ? "Stammdaten" : "",
              result.regimens ? n(result.regimens, "Planpunkt", "Planpunkte") : "",
              result.documents ? `${n(result.documents, "Dokument", "Dokumente")} (${n(result.files, "Datei", "Dateien")})` : "",
              result.labs ? n(result.labs, "Laborwert", "Laborwerte") : "",
              result.events ? n(result.events, "Chronik-Eintrag", "Chronik-Einträge") : "",
              result.questions ? n(result.questions, "Frage", "Fragen") : "",
              result.entries ? n(result.entries, "Protokolleintrag", "Protokolleinträge") : "",
              result.checks ? n(result.checks, "abgehakter Planpunkt", "abgehakte Planpunkte") : "",
              result.photos ? n(result.photos, "Foto", "Fotos") : "",
            ]
              .filter(Boolean)
              .join(" · ") || "nichts Neues"}
          </p>
          {result.skipped ? <p className="hint">{n(result.skipped, "vorhandener Datensatz", "vorhandene Datensätze")} unverändert gelassen.</p> : null}
          {result.warnings.length ? (
            <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
              {result.warnings.slice(0, 12).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
