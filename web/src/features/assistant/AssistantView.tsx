// Claude: Fragen zu Spotty mit der ganzen Akte, dem Plan und den Protokollen als Wissensstand.

import { useCallback, useEffect, useRef, useState } from "react";
import { askClaude, deleteThread, loadThreads, saveMessage, type ChatMessage, type Thread } from "../../lib/claude";
import { copyText } from "../../lib/files";
import { newId } from "../../lib/store";
import { IS_DEMO } from "../../lib/config";
import { Markdown } from "../../ui/Markdown";
import { Icon } from "../../ui/Icon";
import { Sheet, useConfirm, useSheets, useToast } from "../../ui/overlays";
import { berlinOfIso, fmtDayShort } from "@shared/dates.ts";

const SUGGESTIONS = [
  "Wie haben sich Atemzüge, Trinken und Futter seit Therapiebeginn entwickelt?",
  "Ist im heutigen Protokoll etwas auffällig?",
  "Erkläre mir den neuesten Befund und was er für die Behandlung bedeutet.",
  "Welche Laborwerte waren zuletzt auffällig, und was heißt das?",
  "Worauf müssen wir bei den aktuellen Medikamenten achten?",
  "Bei welchen Anzeichen sollen wir sofort in der Klinik anrufen?",
];

interface Live {
  thread: string;
  messages: ChatMessage[];
  streaming: string | null;
  error: string | null;
}

export function AssistantView({ prompt, onPromptUsed }: { prompt: string | null; onPromptUsed: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [live, setLive] = useState<Live>(() => ({ thread: newId(), messages: [], streaming: null, error: null }));
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sheets = useSheets();
  const toast = useToast();
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    try {
      setThreads(await loadThreads());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const busy = live.streaming !== null;

  const send = useCallback(
    async (q: string, fresh = false) => {
      const question = q.trim();
      if (!question || abortRef.current) return;
      const thread = fresh ? newId() : live.thread;
      const base = fresh ? [] : live.messages;
      const userMsg: ChatMessage = { id: newId(), thread, role: "user", content: question, created_at: new Date().toISOString() };
      const history = [...base, userMsg];
      setLive({ thread, messages: history, streaming: "", error: null });
      setText("");
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      saveMessage(thread, "user", question).catch(() => undefined);
      let answer = "";
      let latest = "";
      try {
        answer = await askClaude(
          history.map((m) => ({ role: m.role, content: m.content })),
          (full) => {
            latest = full;
            setLive((l) => (l.thread === thread ? { ...l, streaming: full } : l));
          },
          ctrl.signal,
        );
      } catch (e) {
        const aborted = ctrl.signal.aborted;
        answer = latest;
        if (aborted && answer) answer += "\n\n*(abgebrochen)*";
        const msg = aborted ? null : e instanceof Error ? e.message : String(e);
        setLive((l) => (l.thread === thread ? { ...l, error: msg } : l));
      } finally {
        abortRef.current = null;
      }
      if (answer.trim()) {
        const msg: ChatMessage = { id: newId(), thread, role: "assistant", content: answer, created_at: new Date().toISOString() };
        setLive((l) => (l.thread === thread ? { ...l, messages: [...l.messages, msg], streaming: null } : l));
        saveMessage(thread, "assistant", answer)
          .then(() => refresh())
          .catch(() => undefined);
      } else setLive((l) => (l.thread === thread ? { ...l, streaming: null } : l));
    },
    [live.thread, live.messages, refresh],
  );

  // Frage aus einem anderen Reiter (z. B. „Mit Claude besprechen“) als neues Gespräch stellen
  useEffect(() => {
    if (prompt && !abortRef.current) {
      onPromptUsed();
      void send(prompt, true);
    }
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [live.messages.length, live.streaming === null]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  const openThread = (t: Thread) => setLive({ thread: t.id, messages: t.messages, streaming: null, error: null });
  const newChat = () => {
    abortRef.current?.abort();
    setLive({ thread: newId(), messages: [], streaming: null, error: null });
  };

  const history = () =>
    sheets.open((close) => (
      <Sheet title="Frühere Gespräche" onClose={close}>
        {!threads.length ? <p className="hint">Noch keine gespeicherten Gespräche.</p> : null}
        <div className="card flush">
          {threads.map((t) => (
            <div key={t.id} className="erow" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
              <button
                style={{ border: 0, background: "none", textAlign: "left", padding: 0 }}
                onClick={() => {
                  openThread(t);
                  close();
                }}
              >
                <span className="s" style={{ display: "block" }}>
                  {t.title}
                </span>
                <span className="x" style={{ display: "block" }}>
                  {fmtDayShort(berlinOfIso(t.updated).day)} {berlinOfIso(t.updated).hm} · {t.messages.length} Nachrichten
                </span>
              </button>
              <button
                className="icon-btn"
                aria-label="Gespräch löschen"
                onClick={async () => {
                  if (await confirm({ title: "Gespräch löschen?", text: t.title, confirm: "Löschen", danger: true })) {
                    await deleteThread(t).catch(() => undefined);
                    if (live.thread === t.id) newChat();
                    await refresh();
                    close();
                  }
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
        <p className="hint">Gespräche sind nur für dich sichtbar. Die anderen sehen ihre eigenen.</p>
      </Sheet>
    ));

  const empty = !live.messages.length && !busy;

  return (
    <div className="stack" style={{ minHeight: "calc(100dvh - 220px)" }}>
      <div className="row between">
        <button className="btn small ghost" onClick={history}>
          Frühere Gespräche{threads.length ? ` (${threads.length})` : ""}
        </button>
        {!empty ? (
          <button className="btn small ghost" onClick={newChat}>
            <Icon name="plus" size={18} /> Neues Gespräch
          </button>
        ) : null}
      </div>

      {empty ? (
        <div className="stack">
          <div className="card stack-s">
            <b>Claude kennt die ganze Akte</b>
            <p className="small">
              Befunde, Laborwerte, Chronik, Behandlungsplan, die Protokolle der letzten zwei Wochen und die offenen Fragen an die Klinik. Claude nennt dazu Datum und Quelle und trennt Befund, Beobachtung und eigene Einschätzung. Dosierungen ändert nur die Klinik.
            </p>
            {IS_DEMO ? <p className="hint">Demo-Modus: noch ohne Verbindung zu Claude.</p> : null}
          </div>
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => void send(s, true)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chat" aria-live="polite">
          {live.messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              {m.role === "assistant" ? (
                <>
                  <div className="by">Claude</div>
                  <Markdown text={m.content} />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      className="link-btn"
                      onClick={async () => {
                        const ok = await copyText(m.content);
                        toast.show(ok ? "Antwort kopiert" : "Kopieren nicht möglich", { error: !ok });
                      }}
                    >
                      Kopieren
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
              )}
            </div>
          ))}
          {busy ? (
            <div className="msg assistant">
              <div className="by">Claude</div>
              {live.streaming ? <Markdown text={live.streaming} /> : <p className="muted">Liest die Akte …</p>}
              <span className="typing" />
            </div>
          ) : null}
          {live.error ? (
            <div className="banner warn">
              <div className="head">Keine Antwort</div>
              <p>{live.error}</p>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      )}

      {loadError ? <p className="hint">Frühere Gespräche konnten nicht geladen werden: {loadError}</p> : null}

      <div style={{ flex: 1 }} />
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) abortRef.current?.abort();
          else void send(text);
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Frage an Claude
        </label>
        <textarea
          id="ask"
          ref={taRef}
          rows={1}
          value={text}
          placeholder={live.messages.length ? "Nachfragen …" : "Frage zu Spotty …"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              if (!busy) void send(text);
            }
          }}
        />
        <button type="submit" aria-label={busy ? "Antwort abbrechen" : "Senden"} disabled={!busy && !text.trim()}>
          {busy ? <Icon name="close" size={20} stroke={2.4} /> : <Icon name="send" size={20} stroke={2.4} />}
        </button>
      </form>
      <p className="hint" style={{ textAlign: "center" }}>
        Claude ersetzt keine Tierärztin. Bei Warnzeichen die Klinik anrufen.
      </p>
    </div>
  );
}
