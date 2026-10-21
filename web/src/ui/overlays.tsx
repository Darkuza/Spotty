// Bottom Sheets, Bestätigungen und kurze Mitteilungen (Toasts).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { ErrorBoundary } from "./ErrorBoundary";

// Escape schließt nur das oberste Fenster.
const escStack: (() => void)[] = [];
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && escStack.length) {
      e.preventDefault();
      escStack[escStack.length - 1]();
    }
  });
}
function useEscape(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = () => ref.current();
    escStack.push(fn);
    return () => {
      const i = escStack.lastIndexOf(fn);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Sheets (stapelbar)
// ---------------------------------------------------------------------------

interface SheetApi {
  open: (render: (close: () => void) => ReactNode) => void;
  closeTop: () => void;
}

const SheetCtx = createContext<SheetApi | null>(null);

export function SheetHost({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<{ id: number; render: (close: () => void) => ReactNode }[]>([]);
  const counter = useRef(0);
  const api = useMemo<SheetApi>(
    () => ({
      open: (render) => setStack((s) => [...s, { id: ++counter.current, render }]),
      closeTop: () => setStack((s) => s.slice(0, -1)),
    }),
    [],
  );
  return (
    <SheetCtx.Provider value={api}>
      {children}
      {stack.map((s) => (
        <SheetSlot key={s.id} onClose={() => setStack((st) => st.filter((x) => x.id !== s.id))} render={s.render} />
      ))}
    </SheetCtx.Provider>
  );
}

function SheetSlot({ render, onClose }: { render: (close: () => void) => ReactNode; onClose: () => void }) {
  return (
    <ErrorBoundary
      label="Dieses Fenster"
      compact
      wrap={(content) => (
        <Sheet title="Fehler" onClose={onClose}>
          {content}
        </Sheet>
      )}
    >
      {render(onClose)}
    </ErrorBoundary>
  );
}

export function useSheets(): SheetApi {
  const ctx = useContext(SheetCtx);
  if (!ctx) throw new Error("SheetHost fehlt");
  return ctx;
}

export function Sheet({
  title,
  onClose,
  children,
  footer,
  headerExtra,
  onDone,
  doneDisabled,
  doneLabel,
  hideTitle,
  tall,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  /** Haken oben rechts (Speichern, Fertig) */
  onDone?: () => void;
  doneDisabled?: boolean;
  doneLabel?: string;
  /** Titel nur für Screenreader, wenn der Inhalt einen eigenen großen Titel zeigt */
  hideTitle?: boolean;
  /** immer fast bildschirmhoch, wie Eingabeblätter in Health */
  tall?: boolean;
}) {
  useEscape(onClose);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return createPortal(
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className={`sheet${tall ? " tall" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-bar">
          <button type="button" className="cb" onClick={onClose} aria-label="Schließen" title="Schließen">
            <Icon name="close" size={19} stroke={2.4} />
          </button>
          <h2 className={`sheet-title${hideTitle ? " sr-only" : ""}`}>{title}</h2>
          {onDone ? (
            <button type="button" className="cb done" onClick={onDone} disabled={doneDisabled} aria-label={doneLabel || "Fertig"} title={doneLabel || "Fertig"}>
              <Icon name="check" size={20} stroke={2.6} />
            </button>
          ) : headerExtra ? (
            headerExtra
          ) : (
            <span className="cb-space" aria-hidden="true" />
          )}
        </div>
        <div className="sheet-body">
          <div className="inner">{children}</div>
        </div>
        {footer ? (
          <div className="sheet-foot">
            <div className="inner">{footer}</div>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

/** Rückfrage in der Mitte des Bildschirms, wie ein iOS-Hinweisfenster. */
function AlertDialog({ title, text, confirm, danger, onAnswer }: { title: string; text?: string; confirm: string; danger?: boolean; onAnswer: (ok: boolean) => void }) {
  useEscape(() => onAnswer(false));
  return createPortal(
    <>
      <div className="alert-bg" onClick={() => onAnswer(false)} />
      <div className="alert" role="alertdialog" aria-modal="true" aria-label={title}>
        <p className="alert-t">{title}</p>
        {text ? <p className="alert-x">{text}</p> : null}
        <div className="alert-b">
          <button type="button" className="pill gray" onClick={() => onAnswer(false)}>
            Abbrechen
          </button>
          <button type="button" className={`pill ${danger ? "gray red" : "fill"}`} onClick={() => onAnswer(true)} autoFocus>
            {confirm}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Bestätigung als eigenes Fenster (window.confirm ist in eingebetteten Ansichten unzuverlässig). */
export function useConfirm() {
  const sheets = useSheets();
  return useCallback(
    (opts: { title: string; text?: string; confirm: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        sheets.open((close) => (
          <AlertDialog
            {...opts}
            onAnswer={(ok) => {
              resolve(ok);
              close();
            }}
          />
        ));
      }),
    [sheets],
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface ToastItem {
  id: number;
  text: string;
  error?: boolean;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show: (text: string, opts?: { error?: boolean; action?: { label: string; run: () => void }; ms?: number }) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const api = useMemo<ToastApi>(
    () => ({
      show: (text, opts = {}) => {
        const id = ++counter.current;
        setItems((s) => [...s.slice(-2), { id, text, error: opts.error, action: opts.action }]);
        setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), opts.ms ?? (opts.action ? 6000 : 2600));
      },
    }),
    [],
  );
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast${t.error ? " error" : ""}`}>
              <span>{t.text}</span>
              {t.action ? (
                <button
                  onClick={() => {
                    t.action?.run();
                    setItems((s) => s.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("ToastHost fehlt");
  return ctx;
}
