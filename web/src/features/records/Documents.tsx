// Dokumente: Liste aller Befunde und Berichte, Ansicht mit Originaldateien, Hochladen und Auslesen durch Claude.

import { useMemo, useRef, useState } from "react";
import type { Doc, DocFile, Finding, Lab, TimelineEvent } from "@shared/types.ts";
import { fmtDMY, fmtDayLong, isValidDay, isValidHm, todayKey } from "@shared/dates.ts";
import { useDocs, useEvents, useLabs, saveDoc, deleteDoc, saveLab, deleteLab, saveEvent, saveQuestion, useQuestions } from "../../lib/data";
import { backend } from "../../lib/config";
import { newId } from "../../lib/store";
import { extOf, fmtBytes, safeName, shrinkImage } from "../../lib/files";
import { Sheet, useConfirm, useSheets, useToast } from "../../ui/overlays";
import { Chips, Field, TextField, AreaField, Toggle } from "../../ui/controls";
import { Icon } from "../../ui/Icon";
import { useFileUrl, StorageImage } from "../../ui/StorageImage";
import { Empty } from "../common";
import { fmtLab, isOut, labValue } from "./Labs";

export const KIND_LABEL: Record<string, string> = {
  befund: "Befund",
  labor: "Labor",
  bildgebung: "Bildgebung",
  bericht: "Bericht",
  rechnung: "Rechnung",
  plan: "Plan",
  test: "Test",
  sonstiges: "Sonstiges",
};

const KIND_OPTS: [string, string][] = Object.entries(KIND_LABEL);

export function StatusTag({ status }: { status: Doc["status"] }) {
  if (status === "original_fehlt") return <span className="tag warn">Original fehlt</span>;
  if (status === "ausstehend") return <span className="tag info">ausstehend</span>;
  return null;
}

function docSort(a: Doc, b: Doc): number {
  return (b.doc_date || "0000").localeCompare(a.doc_date || "0000") || a.title.localeCompare(b.title, "de");
}

export function DocumentsPanel({ onAsk, onLabs }: { onAsk: (prompt: string) => void; onLabs: (date: string) => void }) {
  const docs = useDocs();
  const sheets = useSheets();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...docs].filter((d) => !s || [d.title, d.issuer, d.summary, KIND_LABEL[d.kind]].some((x) => (x || "").toLowerCase().includes(s))).sort(docSort);
  }, [docs, q]);
  const open = (d: Doc) => sheets.open((close) => <DocSheet docId={d.id} onClose={close} onAsk={onAsk} onLabs={onLabs} />);
  const years = new Map<string, Doc[]>();
  for (const d of list) {
    const y = d.doc_date ? d.doc_date.slice(0, 4) : "ohne Datum";
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(d);
  }
  return (
    <div className="stack">
      <div className="row">
        <button className="btn primary grow" onClick={() => sheets.open((close) => <UploadSheet onClose={close} onAsk={onAsk} onLabs={onLabs} />)}>
          <Icon name="upload" size={20} /> Dokument hinzufügen
        </button>
      </div>
      {docs.length > 5 ? (
        <div className="field">
          <label htmlFor="doc-search" className="sr-only">
            Dokumente durchsuchen
          </label>
          <input id="doc-search" type="search" placeholder="Suchen: Titel, Klinik, Befund …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      ) : null}
      {!docs.length ? (
        <div className="card">
          <Empty title="Noch keine Dokumente">
            <p>Befunde, Berichte und Rechnungen als PDF oder Foto hinzufügen. Claude liest sie aus und ordnet Laborwerte und Termine zu.</p>
          </Empty>
        </div>
      ) : null}
      {[...years.entries()].map(([y, ds]) => (
        <div key={y} className="stack-s">
          <div className="section-title">
            <h2>{y}</h2>
            <span className="aside">{ds.length}</span>
          </div>
          <div className="card flush">
            {ds.map((d) => (
              <button key={d.id} className="doc" onClick={() => open(d)}>
                <span className="date">
                  {d.doc_date ? `${d.doc_date.slice(8, 10)}.${d.doc_date.slice(5, 7)}.` : "–"}
                  <span>{d.doc_date ? d.doc_date.slice(0, 4) : ""}</span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="title" style={{ display: "block" }}>
                    {d.title}
                  </span>
                  <span className="issuer" style={{ display: "block" }}>
                    {[KIND_LABEL[d.kind] || d.kind, d.issuer].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="stack-s" style={{ alignItems: "flex-end", gap: 4 }}>
                  <StatusTag status={d.status} />
                  {d.files?.length ? (
                    <span className="hint" style={{ whiteSpace: "nowrap" }}>
                      {d.files.length} {d.files.length === 1 ? "Datei" : "Dateien"}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileRow({ file, onRemove }: { file: DocFile; onRemove?: () => void }) {
  const { url, error } = useFileUrl("documents", file.path);
  const isImage = file.mime.startsWith("image/");
  return (
    <div className="erow" style={{ gridTemplateColumns: isImage ? "64px minmax(0,1fr) auto" : "28px minmax(0,1fr) auto", alignItems: "center" }}>
      {isImage ? (
        <a href={url || undefined} target="_blank" rel="noreferrer" className="photo" style={{ aspectRatio: "1", width: 64 }}>
          <StorageImage bucket="documents" path={file.path} alt={file.name} />
        </a>
      ) : (
        <Icon name="file" />
      )}
      <span style={{ minWidth: 0 }}>
        <span className="s" style={{ display: "block", overflowWrap: "anywhere" }}>
          {file.name}
        </span>
        <span className="x" style={{ display: "block" }}>
          {[file.mime === "application/pdf" ? "PDF" : "Bild", fmtBytes(file.bytes)].filter(Boolean).join(" · ")}
          {error ? ` · ${error}` : ""}
        </span>
      </span>
      <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        {url ? (
          <a className="btn small ghost" href={url} target="_blank" rel="noreferrer">
            Öffnen
          </a>
        ) : (
          <span className="hint">…</span>
        )}
        {onRemove ? (
          <button className="icon-btn" onClick={onRemove} aria-label={`${file.name} entfernen`}>
            <Icon name="trash" size={18} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

async function uploadDocFiles(docId: string, files: File[], onStep?: (n: number) => void): Promise<DocFile[]> {
  const out: DocFile[] = [];
  let n = 0;
  for (const f of files) {
    let blob: Blob = f;
    let mime = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "image/jpeg");
    let name = f.name || `datei-${n + 1}`;
    if (mime.startsWith("image/") && f.size > 1.5 * 1024 * 1024) {
      const s = await shrinkImage(f, 2600, 0.86);
      blob = s.blob;
      mime = s.type;
      name = name.replace(/\.(heic|heif|png|webp|jpeg)$/i, ".jpg");
    }
    if (mime === "image/heic" || mime === "image/heif") {
      const s = await shrinkImage(f, 2600, 0.86);
      blob = s.blob;
      mime = s.type;
      name = name.replace(/\.(heic|heif)$/i, ".jpg");
    }
    if (!/\.[a-z0-9]{2,4}$/i.test(name)) name += `.${extOf(mime, name)}`;
    const path = `${docId}/${Date.now().toString(36)}-${safeName(name)}`;
    await backend.upload("documents", path, blob, mime);
    out.push({ path, name, mime, bytes: blob.size });
    onStep?.(++n);
  }
  return out;
}

export interface DocExtraction {
  title: string;
  doc_date: string | null;
  issuer: string | null;
  kind: string;
  summary: string;
  findings: Finding[];
  labs: Omit<Lab, "id" | "document_id" | "date" | "device" | "note">[];
  events: { date: string; time: string | null; title: string; text: string | null; category: string }[];
  fragen: string[];
}

async function extractDoc(doc: Doc): Promise<DocExtraction> {
  const paths = doc.files.filter((f) => f.mime === "application/pdf" || f.mime.startsWith("image/")).map((f) => f.path).slice(0, 8);
  if (!paths.length) throw new Error("Dieses Dokument hat keine lesbare Datei.");
  const r = await backend.invoke<{ ok: boolean; result: DocExtraction }>("extract", { kind: "dokument", bucket: "documents", paths });
  return r.result;
}

function UploadSheet({ onClose, onAsk, onLabs }: { onClose: () => void; onAsk: (p: string) => void; onLabs: (d: string) => void }) {
  const sheets = useSheets();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [useClaude, setUseClaude] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const save = async () => {
    if (!files.length) return;
    const id = `dok-${(date || todayKey()).replace(/-/g, "")}-${newId().slice(0, 6)}`;
    try {
      setBusy(`Lädt hoch … 0/${files.length}`);
      const uploaded = await uploadDocFiles(id, files, (n) => setBusy(`Lädt hoch … ${n}/${files.length}`));
      const doc: Doc = {
        id,
        title: title.trim() || files[0].name.replace(/\.[a-z0-9]+$/i, ""),
        doc_date: isValidDay(date) ? date : null,
        issuer: null,
        kind: "befund",
        summary: null,
        findings: [],
        files: uploaded,
        status: "ok",
        source: "app",
      };
      saveDoc(doc);
      if (useClaude) {
        setBusy("Claude liest das Dokument …");
        try {
          const result = await extractDoc(doc);
          onClose();
          sheets.open((close) => <ExtractDocReview doc={doc} result={result} onClose={close} />);
          return;
        } catch (e) {
          toast.show(`Gespeichert, aber nicht ausgelesen: ${e instanceof Error ? e.message : e}`, { error: true, ms: 6000 });
        }
      } else toast.show("Dokument gespeichert");
      onClose();
      sheets.open((close) => <DocSheet docId={id} onClose={close} onAsk={onAsk} onLabs={onLabs} />);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Hochladen fehlgeschlagen", { error: true });
      setBusy(null);
    }
  };

  return (
    <Sheet
      title="Dokument hinzufügen"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={!!busy}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={!files.length || !!busy} style={{ flex: 2 }}>
            {busy || "Speichern"}
          </button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        hidden
        onChange={(e) => {
          const fs = Array.from(e.target.files || []);
          setFiles((cur) => [...cur, ...fs]);
          if (!title && fs[0]) setTitle(fs[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
          e.target.value = "";
        }}
      />
      <button className="btn ghost block" onClick={() => inputRef.current?.click()} disabled={!!busy}>
        <Icon name="plus" size={20} /> {files.length ? "Weitere Datei / Seite" : "PDF oder Fotos auswählen"}
      </button>
      {files.length ? (
        <div className="card flush">
          {files.map((f, i) => (
            <div key={i} className="erow" style={{ gridTemplateColumns: "28px minmax(0,1fr) auto", alignItems: "center" }}>
              <Icon name="file" />
              <span className="s" style={{ overflowWrap: "anywhere" }}>
                {f.name} <span className="muted small">{fmtBytes(f.size)}</span>
              </span>
              <button className="icon-btn" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label="Entfernen" disabled={!!busy}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">Mehrseitige Befunde als ein PDF oder als mehrere Fotos (eine Seite je Foto). Bis zu 8 Dateien liest Claude zusammen.</p>
      )}
      <TextField label="Titel" value={title} onChange={setTitle} placeholder="z. B. Befundbericht Notdienst" />
      <div className="field">
        <label htmlFor="doc-date">Datum des Dokuments</label>
        <input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
        <span className="hint">Leer lassen, wenn Claude es aus dem Dokument lesen soll.</span>
      </div>
      <Toggle label="Mit Claude auslesen" hint="Zusammenfassung, Einzelbefunde, Laborwerte, Termine und offene Fragen; du prüfst vor dem Übernehmen." checked={useClaude} onChange={setUseClaude} />
    </Sheet>
  );
}

export function ExtractDocReview({ doc, result, onClose }: { doc: Doc; result: DocExtraction; onClose: () => void }) {
  const toast = useToast();
  const existingLabs = useLabs();
  const existingEvents = useEvents();
  const existingQuestions = useQuestions();
  const labs = (result.labs || []).filter((l) => l.param);
  const events = (result.events || []).filter((e) => isValidDay(e.date) && e.title);
  const fragen = (result.fragen || []).filter((f) => f && !existingQuestions.some((q) => q.text === f));
  const date = isValidDay(result.doc_date) ? result.doc_date : doc.doc_date;
  const labDup = labs.length > 0 && !!date && existingLabs.some((l) => l.date === date && l.document_id !== doc.id && labs.some((x) => x.code && x.code === l.code));
  const ownLabs = date ? existingLabs.filter((l) => l.document_id === doc.id && l.date === date).length : 0;
  const [meta, setMeta] = useState(true);
  const [takeLabs, setTakeLabs] = useState(labs.length > 0 && !labDup && !ownLabs);
  const [takeEvents, setTakeEvents] = useState(events.length > 0);
  const [takeQs, setTakeQs] = useState(false);

  const apply = () => {
    const d: Doc = { ...doc };
    if (meta) {
      d.title = result.title || d.title;
      d.doc_date = date || null;
      d.issuer = result.issuer || d.issuer;
      d.kind = KIND_LABEL[result.kind] ? result.kind : d.kind;
      d.summary = result.summary || d.summary;
      d.findings = Array.isArray(result.findings) ? result.findings : d.findings;
    }
    saveDoc(d);
    let nl = 0;
    if (takeLabs && date) {
      // Beim erneuten Auslesen werden die bisherigen Werte dieses Dokuments ersetzt.
      for (const l of existingLabs.filter((x) => x.document_id === doc.id && x.date === date)) deleteLab(l.id);
      for (const l of labs) {
        saveLab({
          id: newId(),
          document_id: doc.id,
          date,
          grp: l.grp || null,
          param: l.param,
          code: l.code || null,
          value: typeof l.value === "number" ? l.value : null,
          value_text: l.value_text || null,
          unit: l.unit || null,
          ref_low: typeof l.ref_low === "number" ? l.ref_low : null,
          ref_high: typeof l.ref_high === "number" ? l.ref_high : null,
          flag: l.flag === "H" || l.flag === "L" ? l.flag : null,
          device: null,
          note: null,
        });
        nl++;
      }
    }
    let ne = 0;
    if (takeEvents) {
      for (const e of events) {
        if (existingEvents.some((x) => x.date === e.date && x.title === e.title)) continue;
        const ev: TimelineEvent = { id: newId(), date: e.date, time: isValidHm(e.time) ? e.time : null, title: e.title, text: e.text || null, category: e.category || "verlauf", document_id: doc.id };
        saveEvent(ev);
        ne++;
      }
    }
    let nq = 0;
    if (takeQs) {
      const start = existingQuestions.reduce((m, q) => Math.max(m, q.sort || 0), 0);
      fragen.forEach((f, i) => {
        saveQuestion({ id: newId(), text: f, sort: start + i + 1, status: "offen", answer: null });
        nq++;
      });
    }
    toast.show(["Dokument aktualisiert", nl ? `${nl} Laborwerte` : "", ne ? `${ne} Chronik-Einträge` : "", nq ? `${nq} Fragen` : ""].filter(Boolean).join(" · "));
    onClose();
  };

  return (
    <Sheet
      title="Von Claude gelesen"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Verwerfen
          </button>
          <button className="btn primary" onClick={apply} style={{ flex: 2 }}>
            Übernehmen
          </button>
        </>
      }
    >
      <p className="hint">Bitte prüfen, bevor es in die Akte geht. Claude kann sich verlesen, vor allem bei Fotos und Handschrift.</p>
      <div className="card stack-s">
        <Toggle label="Titel, Datum, Zusammenfassung und Einzelbefunde" checked={meta} onChange={setMeta} />
        <dl className="kv">
          <dt>Titel</dt>
          <dd>{result.title || "–"}</dd>
          <dt>Datum</dt>
          <dd>{date ? fmtDMY(date) : "nicht erkannt"}</dd>
          <dt>Von</dt>
          <dd>{result.issuer || "–"}</dd>
          <dt>Art</dt>
          <dd>{KIND_LABEL[result.kind] || result.kind}</dd>
        </dl>
        {result.summary ? <p style={{ whiteSpace: "pre-wrap" }}>{result.summary}</p> : null}
        {(result.findings || []).map((f, i) => (
          <div key={i} className={`finding ${f.level || ""}`}>
            <b>{f.label}</b>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
      {labs.length ? (
        <div className="card stack-s">
          <Toggle label={`${labs.length} Laborwerte übernehmen`} hint={!date ? "Ohne Datum können Laborwerte nicht zugeordnet werden." : ownLabs ? `Ersetzt die ${ownLabs} vorhandenen Werte dieses Dokuments.` : labDup ? "Für diesen Tag gibt es schon Werte aus einem anderen Dokument – bitte auf Doppelungen achten." : undefined} checked={takeLabs && !!date} onChange={setTakeLabs} />
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Wert</th>
                  <th>Einheit</th>
                  <th>Referenz</th>
                </tr>
              </thead>
              <tbody>
                {labs.map((l, i) => (
                  <tr key={i}>
                    <td>{l.param}</td>
                    <td style={{ color: isOut({ ...l, id: "", document_id: null, date: "", device: null, note: null } as Lab) ? "var(--danger)" : undefined }}>
                      {labValue({ ...l } as Lab)}
                      {l.flag ? ` ${l.flag}` : ""}
                    </td>
                    <td>{l.unit || ""}</td>
                    <td>{l.ref_low != null || l.ref_high != null ? `${fmtLab(l.ref_low)}–${fmtLab(l.ref_high)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {events.length ? (
        <div className="card stack-s">
          <Toggle label={`${events.length} Einträge in die Chronik`} checked={takeEvents} onChange={setTakeEvents} />
          {events.map((e, i) => (
            <p key={i} className="small">
              <b className="num">{fmtDMY(e.date)}</b> {e.title}
              {e.text ? <span className="muted"> – {e.text}</span> : null}
            </p>
          ))}
        </div>
      ) : null}
      {fragen.length ? (
        <div className="card stack-s">
          <Toggle label={`${fragen.length} offene Fragen an die Klinik`} hint="Vorschläge von Claude; erscheinen unter Akte → Fragen." checked={takeQs} onChange={setTakeQs} />
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {fragen.map((f, i) => (
              <li key={i} className="small">
                {f}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Sheet>
  );
}

export function DocSheet({ docId, onClose, onAsk, onLabs }: { docId: string; onClose: () => void; onAsk: (p: string) => void; onLabs: (d: string) => void }) {
  const docs = useDocs();
  const labs = useLabs();
  const events = useEvents();
  const sheets = useSheets();
  const toast = useToast();
  const confirm = useConfirm();
  const addRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) {
    return (
      <Sheet title="Dokument" onClose={onClose}>
        <p>Dieses Dokument gibt es nicht mehr.</p>
      </Sheet>
    );
  }
  const docLabs = labs.filter((l) => l.document_id === doc.id);
  const labDates = [...new Set(docLabs.map((l) => l.date))].sort();
  const docEvents = events.filter((e) => e.document_id === doc.id).sort((a, b) => a.date.localeCompare(b.date));
  const outLabs = docLabs.filter(isOut);

  const addFiles = async (fs: File[]) => {
    if (!fs.length) return;
    setBusy("Lädt hoch …");
    try {
      const up = await uploadDocFiles(doc.id, fs);
      saveDoc({ ...doc, files: [...(doc.files || []), ...up], status: doc.status === "original_fehlt" ? "ok" : doc.status });
      toast.show(up.length > 1 ? `${up.length} Dateien hinzugefügt` : "Datei hinzugefügt");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Hochladen fehlgeschlagen", { error: true });
    } finally {
      setBusy(null);
    }
  };

  const reread = async () => {
    setBusy("Claude liest …");
    try {
      const result = await extractDoc(doc);
      sheets.open((close) => <ExtractDocReview doc={doc} result={result} onClose={close} />);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Auslesen fehlgeschlagen", { error: true });
    } finally {
      setBusy(null);
    }
  };

  const removeFile = async (f: DocFile) => {
    const ok = await confirm({ title: "Datei entfernen?", text: `${f.name} wird aus der Akte gelöscht.`, confirm: "Entfernen", danger: true });
    if (!ok) return;
    saveDoc({ ...doc, files: doc.files.filter((x) => x.path !== f.path) });
    backend.removeFiles("documents", [f.path]).catch(() => undefined);
  };

  const remove = async () => {
    const ok = await confirm({ title: "Dokument löschen?", text: `„${doc.title}“ mit ${doc.files.length} Datei(en) und ${docLabs.length} Laborwerten wird gelöscht.`, confirm: "Löschen", danger: true });
    if (!ok) return;
    deleteDoc(doc.id);
    backend.removeFiles("documents", doc.files.map((f) => f.path)).catch(() => undefined);
    onClose();
  };

  return (
    <Sheet
      title={doc.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn claude" onClick={() => {
            onClose();
            onAsk(`Bitte erkläre mir das Dokument „${doc.title}“${doc.doc_date ? ` vom ${fmtDMY(doc.doc_date)}` : ""} in einfachen Worten: Was wurde untersucht, was ist auffällig, was bedeutet das für Spotty, und welche Fragen sollten wir dazu stellen?`);
          }}>
            <Icon name="claude" size={20} /> Mit Claude besprechen
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 6 }}>
        <span className="tag">{KIND_LABEL[doc.kind] || doc.kind}</span>
        <StatusTag status={doc.status} />
        {doc.source === "import" ? <span className="tag">aus der Akte</span> : null}
      </div>
      <dl className="kv">
        <dt>Datum</dt>
        <dd>{doc.doc_date ? fmtDayLong(doc.doc_date) : "unbekannt"}</dd>
        {doc.issuer ? (
          <>
            <dt>Von</dt>
            <dd>{doc.issuer}</dd>
          </>
        ) : null}
      </dl>
      {doc.summary ? (
        <div className="stack-s">
          {doc.summary.split(/\n{2,}/).map((p, i) => (
            <p key={i} style={{ whiteSpace: "pre-wrap" }}>
              {p}
            </p>
          ))}
        </div>
      ) : (
        <p className="hint">Noch keine Zusammenfassung.</p>
      )}
      {doc.findings?.length ? (
        <div className="stack-s">
          <div className="section-title">
            <h2>Einzelbefunde</h2>
          </div>
          {doc.findings.map((f, i) => (
            <div key={i} className={`finding ${f.level || ""}`}>
              <b>{f.label}</b>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      ) : null}
      {docLabs.length ? (
        <div className="card stack-s">
          <div className="row between">
            <b>
              {docLabs.length} Laborwerte{outLabs.length ? `, ${outLabs.length} außerhalb der Referenz` : ""}
            </b>
            <button
              className="btn small ghost"
              onClick={() => {
                onClose();
                onLabs(labDates[labDates.length - 1]);
              }}
            >
              Ansehen
            </button>
          </div>
          {outLabs.length ? <p className="small">{outLabs.map((l) => `${l.param} ${labValue(l)}${l.unit ? ` ${l.unit}` : ""}${l.flag ? ` (${l.flag})` : ""}`).join(" · ")}</p> : null}
        </div>
      ) : null}
      {docEvents.length ? (
        <div className="stack-s">
          <div className="section-title">
            <h2>In der Chronik</h2>
          </div>
          {docEvents.map((e) => (
            <p key={e.id} className="small">
              <b className="num">{fmtDMY(e.date)}</b> {e.title}
            </p>
          ))}
        </div>
      ) : null}
      <div className="section-title">
        <h2>Dateien</h2>
        <span className="aside">{doc.files?.length || 0}</span>
      </div>
      {doc.files?.length ? (
        <div className="card flush">
          {doc.files.map((f) => (
            <FileRow key={f.path} file={f} onRemove={() => void removeFile(f)} />
          ))}
        </div>
      ) : (
        <p className="hint">{doc.status === "original_fehlt" ? "Das Original liegt nicht vor. Inhalt stammt aus Gesprächen und Notizen." : "Keine Datei hinterlegt."}</p>
      )}
      <input ref={addRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => {
        void addFiles(Array.from(e.target.files || []));
        e.target.value = "";
      }} />
      <div className="grid-2">
        <button className="btn ghost" onClick={() => addRef.current?.click()} disabled={!!busy}>
          <Icon name="plus" size={20} /> Datei
        </button>
        <button className="btn ghost" onClick={() => void reread()} disabled={!!busy || !doc.files?.length}>
          <Icon name="refresh" size={20} /> {busy && busy.startsWith("Claude") ? "Liest …" : "Auslesen"}
        </button>
        <button className="btn ghost" onClick={() => sheets.open((close) => <DocEditSheet doc={doc} onClose={close} />)}>
          <Icon name="edit" size={20} /> Bearbeiten
        </button>
        <button className="btn danger" onClick={() => void remove()}>
          <Icon name="trash" size={20} /> Löschen
        </button>
      </div>
      {busy ? <p className="hint">{busy}</p> : null}
    </Sheet>
  );
}

function DocEditSheet({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [date, setDate] = useState(doc.doc_date || "");
  const [issuer, setIssuer] = useState(doc.issuer || "");
  const [kind, setKind] = useState(doc.kind);
  const [status, setStatus] = useState<Doc["status"]>(doc.status);
  const [summary, setSummary] = useState(doc.summary || "");
  const [findings, setFindings] = useState(
    (doc.findings || []).map((f) => `${f.level === "crit" ? "!! " : f.level === "warn" ? "! " : ""}${f.label}: ${f.text}`).join("\n"),
  );
  const save = () => {
    const parsed: Finding[] = findings
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        let level: Finding["level"] = "info";
        if (line.startsWith("!! ")) {
          level = "crit";
          line = line.slice(3);
        } else if (line.startsWith("! ")) {
          level = "warn";
          line = line.slice(2);
        }
        const i = line.indexOf(":");
        return i > 0 ? { label: line.slice(0, i).trim(), text: line.slice(i + 1).trim(), level } : { label: "Befund", text: line, level };
      });
    saveDoc({ ...doc, title: title.trim() || doc.title, doc_date: isValidDay(date) ? date : null, issuer: issuer.trim() || null, kind, status, summary: summary.trim() || null, findings: parsed });
    onClose();
  };
  return (
    <Sheet
      title="Dokument bearbeiten"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save} style={{ flex: 2 }}>
            Speichern
          </button>
        </>
      }
    >
      <TextField label="Titel" value={title} onChange={setTitle} />
      <div className="field">
        <label htmlFor="doc-edit-date">Datum</label>
        <input id="doc-edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
      </div>
      <TextField label="Von (Einrichtung, Person)" value={issuer} onChange={setIssuer} />
      <Field label="Art">
        <Chips options={KIND_OPTS} value={kind} onChange={(v) => setKind(v || kind)} allowEmpty={false} />
      </Field>
      <Field label="Status">
        <Chips
          options={[
            ["ok", "liegt vor"],
            ["original_fehlt", "Original fehlt"],
            ["ausstehend", "ausstehend"],
          ]}
          value={status}
          onChange={(v) => setStatus((v as Doc["status"]) || status)}
          allowEmpty={false}
        />
      </Field>
      <AreaField label="Zusammenfassung" value={summary} onChange={setSummary} rows={8} />
      <AreaField label="Einzelbefunde (eine Zeile je Befund, „Bezeichnung: Text“; ! = auffällig, !! = kritisch)" value={findings} onChange={setFindings} rows={6} />
    </Sheet>
  );
}
