// Fragen an die Klinik: offene Punkte sammeln, beim Telefonat abhaken und die Antwort festhalten.

import { useState } from "react";
import type { Question } from "@shared/types.ts";
import { fmtDMY, berlinOfIso } from "@shared/dates.ts";
import { useQuestions, saveQuestion, deleteQuestion } from "../../lib/data";
import { useNameOf } from "../../lib/session";
import { newId, store } from "../../lib/store";
import { copyText } from "../../lib/files";
import { Sheet, useConfirm, useSheets, useToast } from "../../ui/overlays";
import { AreaField, Chips, Field } from "../../ui/controls";
import { Icon } from "../../ui/Icon";
import { Empty } from "../common";

export function QuestionsPanel({ onAsk }: { onAsk: (p: string) => void }) {
  const qs = useQuestions();
  const sheets = useSheets();
  const toast = useToast();
  const nameOf = useNameOf();
  const [showDone, setShowDone] = useState(false);
  const open = [...qs].filter((q) => q.status !== "geklaert").sort((a, b) => a.sort - b.sort);
  const done = [...qs].filter((q) => q.status === "geklaert").sort((a, b) => (b.answered_at || "").localeCompare(a.answered_at || ""));
  const edit = (q: Question | null) => sheets.open((close) => <QuestionSheet q={q} nextSort={qs.reduce((m, x) => Math.max(m, x.sort || 0), 0) + 1} onClose={close} />);
  const copyOpen = async () => {
    const ok = await copyText(`Fragen zu Spotty\n\n${open.map((q, i) => `${i + 1}. ${q.text}`).join("\n")}`);
    toast.show(ok ? "Offene Fragen kopiert" : "Kopieren nicht möglich", { error: !ok });
  };
  return (
    <div className="stack">
      <div className="grid-2">
        <button className="btn primary" onClick={() => edit(null)}>
          <Icon name="plus" size={20} /> Frage
        </button>
        <button className="btn ghost" onClick={() => void copyOpen()} disabled={!open.length}>
          <Icon name="copy" size={20} /> Kopieren
        </button>
      </div>
      {!qs.length ? (
        <div className="card">
          <Empty title="Keine Fragen notiert">
            <p>Hier sammelt ihr, was beim nächsten Anruf oder Termin mit der Klinik geklärt werden soll.</p>
          </Empty>
        </div>
      ) : null}
      {open.length ? (
        <>
          <div className="section-title">
            <h2>Offen</h2>
            <span className="aside">{open.length}</span>
          </div>
          <div className="card flush">
            {open.map((q, i) => (
              <button key={q.id} className="erow" style={{ gridTemplateColumns: "28px minmax(0,1fr)" }} onClick={() => edit(q)}>
                <span className="t" style={{ fontSize: 15, color: "var(--muted)" }}>
                  {i + 1}
                </span>
                <span className="s" style={{ fontWeight: 450 }}>
                  {q.text}
                </span>
              </button>
            ))}
          </div>
          <button className="btn claude" onClick={() => onAsk("Bitte hilf mir, das nächste Gespräch mit der Klinik vorzubereiten: Welche der offenen Fragen sind am wichtigsten, in welcher Reihenfolge stelle ich sie, und was sollte ich zu Spottys aktuellem Verlauf berichten?")}>
            <Icon name="claude" size={20} /> Gespräch mit der Klinik vorbereiten
          </button>
        </>
      ) : null}
      {done.length ? (
        <>
          <div className="section-title">
            <h2>Geklärt</h2>
            <button className="link-btn" onClick={() => setShowDone((s) => !s)}>
              {showDone ? "ausblenden" : `${done.length} anzeigen`}
            </button>
          </div>
          {showDone ? (
            <div className="card flush">
              {done.map((q) => (
                <button key={q.id} className="erow" style={{ gridTemplateColumns: "28px minmax(0,1fr)" }} onClick={() => edit(q)}>
                  <span style={{ color: "var(--ok)" }}>
                    <Icon name="check" size={20} stroke={2.4} />
                  </span>
                  <span>
                    <span className="s" style={{ display: "block", fontWeight: 450 }}>
                      {q.text}
                    </span>
                    {q.answer ? (
                      <span className="x" style={{ display: "block", color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
                        {q.answer}
                      </span>
                    ) : null}
                    {q.answered_at ? (
                      <span className="x" style={{ display: "block" }}>
                        {fmtDMY(berlinOfIso(q.answered_at).day)}
                        {q.answered_by ? ` · ${nameOf(q.answered_by)}` : ""}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function QuestionSheet({ q, nextSort, onClose }: { q: Question | null; nextSort: number; onClose: () => void }) {
  const confirm = useConfirm();
  const [text, setText] = useState(q?.text || "");
  const [answer, setAnswer] = useState(q?.answer || "");
  const [status, setStatus] = useState<Question["status"]>(q?.status || "offen");
  const save = () => {
    if (!text.trim()) return;
    const becameDone = status === "geklaert" && q?.status !== "geklaert";
    saveQuestion({
      ...(q || {}),
      id: q?.id || newId(),
      text: text.trim(),
      sort: q?.sort ?? nextSort,
      status,
      answer: answer.trim() || null,
      answered_at: status === "geklaert" ? (becameDone ? new Date().toISOString() : q?.answered_at || new Date().toISOString()) : null,
      answered_by: status === "geklaert" ? (becameDone ? store.userId || null : q?.answered_by || null) : null,
    });
    onClose();
  };
  return (
    <Sheet
      title={q ? "Frage an die Klinik" : "Neue Frage"}
      onClose={onClose}
      footer={
        <>
          {q ? (
            <button
              className="btn danger"
              onClick={async () => {
                if (await confirm({ title: "Frage löschen?", text: q.text, confirm: "Löschen", danger: true })) {
                  deleteQuestion(q.id);
                  onClose();
                }
              }}
            >
              Löschen
            </button>
          ) : (
            <button className="btn ghost" onClick={onClose}>
              Abbrechen
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={!text.trim()} style={{ flex: 2 }}>
            Speichern
          </button>
        </>
      }
    >
      <AreaField label="Frage" value={text} onChange={setText} rows={3} />
      <Field label="Stand">
        <Chips
          options={[
            ["offen", "offen"],
            ["geklaert", "geklärt"],
          ]}
          value={status}
          onChange={(v) => setStatus((v as Question["status"]) || status)}
          allowEmpty={false}
        />
      </Field>
      <AreaField label="Antwort der Klinik" value={answer} onChange={setAnswer} rows={4} placeholder="Was wurde gesagt, von wem, wann?" />
    </Sheet>
  );
}
