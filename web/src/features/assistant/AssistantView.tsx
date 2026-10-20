// Claude: Fragen zu Spotty mit der ganzen Akte, dem Plan und den Protokollen als Wissensstand.

import { useCallback, useEffect, useRef, useState } from "react";
import { PHOTO_MARK, askClaude, blobToBase64, deleteThread, loadThreads, saveMessage, type ChatImage, type ChatMessage, type Thread } from "../../lib/claude";
import { copyText, shrinkImage } from "../../lib/files";
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
  const [attach, setAttach] = useState<ChatImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
    async (q: string, fresh = false, image: ChatImage | null = null) => {
      const question = q.trim() || (image ? "Bitte sieh dir das Foto an und ordne es ein." : "");
      if (!question || abortRef.current) return;
      const thread = fresh ? newId() : live.thread;
      const base = fresh ? [] : live.messages;
      const userMsg: ChatMessage = { id: newId(), thread, role: "user", content: question, created_at: new Date().toISOString(), image };
      const history = [...base, userMsg];
      setLive({ thread, messages: history, streaming: "", error: null });
      setText("");
      setAttach(null);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      saveMessage(thread, "user", image ? `${question}\n\n${PHOTO_MARK}` : question).catch(() => undefined);
      let answer = "";
      let latest = "";
      try {
        answer = await askClaude(
          history.map((m) => ({ role: m.role, content: m.content, image: m.image })),
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

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      const shrunk = await shrinkImage(file, 1568, 0.85);
      const data = await blobToBase64(shrunk.blob);
      if (data.length > 6_000_000) throw new Error("Das Foto ist zu groß. Bitte ein kleineres wählen.");
      if (attach) URL.revokeObjectURL(attach.url);
      setAttach({ media_type: shrunk.type === "image/png" ? "image/png" : shrunk.type === "image/webp" ? "image/webp" : "image/jpeg", data, url: URL.createObjectURL(shrunk.blob) });
      taRef.current?.focus();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Foto konnte nicht geladen werden.", { error: true });
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Vorschaubilder der laufenden Unterhaltung freigeben, wenn sie verlassen wird.
  const releasePhotos = () => {
    for (const m of live.messages) if (m.image?.url) URL.revokeObjectURL(m.image.url);
  };
  const openThread = (t: Thread) => {
    if (t.id !== live.thread) releasePhotos();
    setLive({ thread: t.id, messages: t.messages, streaming: null, error: null });
  };
  const newChat = () => {
    abortRef.current?.abort();
    releasePhotos();
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
                <>
                  {m.image ? <img className="msg-photo" src={m.image.url} alt="Mitgeschicktes Foto" /> : null}
                  <p style={{ whiteSpace: "pre-wrap" }}>{m.content.replace(`\n\n${PHOTO_MARK}`, "")}</p>
                  {!m.image && m.content.includes(PHOTO_MARK) ? <p className="hint">Mit Foto gefragt (Fotos werden nicht gespeichert).</p> : null}
                </>
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
      <div className="composer-dock">
        {attach ? (
          <div className="attach-preview">
            <img src={attach.url} alt="Foto für die nächste Frage" />
            <span className="small grow">Foto wird mit der nächsten Frage geschickt.</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Foto entfernen"
              onClick={() => {
                URL.revokeObjectURL(attach.url);
                setAttach(null);
              }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        ) : null}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) abortRef.current?.abort();
            else void send(text, false, attach);
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <button type="button" className="attach" aria-label="Foto anhängen" disabled={busy || preparing} onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={20} />
          </button>
          <label htmlFor="ask" className="sr-only">
            Frage an Claude
          </label>
          <textarea
            id="ask"
            ref={taRef}
            rows={1}
            value={text}
            placeholder={attach ? "Frage zum Foto …" : live.messages.length ? "Nachfragen …" : "Frage zu Spotty …"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                if (!busy) void send(text, false, attach);
              }
            }}
          />
          <button type="submit" aria-label={busy ? "Antwort abbrechen" : "Senden"} disabled={!busy && !text.trim() && !attach}>
            {busy ? <Icon name="close" size={20} stroke={2.4} /> : <Icon name="send" size={20} stroke={2.4} />}
          </button>
        </form>
      </div>
      <p className="hint" style={{ textAlign: "center" }}>
        Claude ersetzt keine Tierärztin. Bei Warnzeichen die Klinik anrufen.
      </p>
    </div>
  );
}
