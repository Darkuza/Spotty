// Bottom Sheets, Bestätigungen und kurze Mitteilungen (Toasts).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { ErrorBoundary } from "./ErrorBoundary";

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

export function Sheet({ title, onClose, children, footer, headerExtra }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; headerExtra?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="inner sheet-head">
          <h2>{title}</h2>
          {headerExtra}
          <button className="ib" onClick={onClose} aria-label="Schließen">
            <Icon name="close" size={18} stroke={2.1} />
          </button>
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

/** Bestätigung als eigenes Sheet (window.confirm ist in eingebetteten Ansichten unzuverlässig). */
export function useConfirm() {
  const sheets = useSheets();
  return useCallback(
    (opts: { title: string; text?: string; confirm: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        sheets.open((close) => (
          <Sheet
            title={opts.title}
            onClose={() => {
              resolve(false);
              close();
            }}
            footer={
              <>
                <button
                  className="btn ghost"
                  onClick={() => {
                    resolve(false);
                    close();
                  }}
                >
                  Abbrechen
                </button>
                <button
                  className={`btn ${opts.danger ? "danger" : "primary"}`}
                  onClick={() => {
                    resolve(true);
                    close();
                  }}
                >
                  {opts.confirm}
                </button>
              </>
            }
          >
            {opts.text ? <p>{opts.text}</p> : null}
          </Sheet>
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
