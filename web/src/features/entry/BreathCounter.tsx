// Atemzähler: bei jedem Atemzug auf den Kreis tippen; nach 30 (oder 60) Sekunden wird auf eine Minute hochgerechnet.

import { useEffect, useRef, useState } from "react";

const R = 106;
const C = 2 * Math.PI * R;

export function BreathCounter({ onResult }: { onResult: (bpm: number, seconds: number) => void }) {
  const [duration, setDuration] = useState<30 | 60>(30);
  const [count, setCount] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      void wakeLock.current?.release().catch(() => {});
    },
    [],
  );

  const finish = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setDone(true);
    setElapsed(duration);
    const bpm = Math.round((countRef.current * 60) / duration);
    onResult(bpm, duration);
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  };

  const tap = () => {
    if (done) return;
    if (start === null) {
      const t0 = performance.now();
      setStart(t0);
      timer.current = setInterval(() => {
        const s = (performance.now() - t0) / 1000;
        if (s >= duration) finish();
        else setElapsed(s);
      }, 100);
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      nav.wakeLock
        ?.request("screen")
        .then((l) => (wakeLock.current = l))
        .catch(() => {});
    }
    countRef.current += 1;
    setCount(countRef.current);
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const reset = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    countRef.current = 0;
    setCount(0);
    setStart(null);
    setElapsed(0);
    setDone(false);
  };

  const shown = Math.min(elapsed, duration);
  const estimate = start !== null && elapsed >= 8 && !done ? Math.round((count * 60) / Math.max(elapsed, 1)) : null;
  const result = done ? Math.round((count * 60) / duration) : null;
  const fmtS = (s: number) => `0:${String(Math.floor(s)).padStart(2, "0")}`;

  return (
    <div className="counter">
      <div className="counter-head">
        <div className="chips" role="group" aria-label="Zähldauer">
          {[30, 60].map((d) => (
            <button key={d} type="button" className="chip small" aria-pressed={duration === d} disabled={start !== null && !done} onClick={() => setDuration(d as 30 | 60)}>
              {d} Sekunden
            </button>
          ))}
        </div>
        <button type="button" className="link-btn" onClick={reset} disabled={start === null}>
          Neu zählen
        </button>
      </div>
      <div className={`ring${done ? " done" : ""}`}>
        <svg width="232" height="232" viewBox="0 0 232 232" aria-hidden="true">
          <circle className="ring-bg" cx="116" cy="116" r={R} fill="none" strokeWidth="10" />
          <circle className="ring-fg" cx="116" cy="116" r={R} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - shown / duration)} transform="rotate(-90 116 116)" />
        </svg>
        <button
          type="button"
          className="ring-pad"
          onPointerDown={(e) => {
            e.preventDefault();
            tap();
          }}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              tap();
            }
          }}
          aria-label={done ? `${result} Atemzüge pro Minute` : "Bei jedem Atemzug tippen"}
        >
          <span className="n">{done ? result : count}</span>
          <span className="w">{done ? "pro Minute" : "Atemzüge"}</span>
          <span className="s">{done ? `${count} in ${duration} s` : start === null ? "antippen" : `${fmtS(shown)} von ${fmtS(duration)}`}</span>
        </button>
      </div>
      <p className="t2" style={{ textAlign: "center", maxWidth: 320 }}>
        {done ? (
          <>Gezählt. Unten Lage und Untergrund wählen, dann speichern.</>
        ) : start === null ? (
          <>Beim ersten Atemzug tippen, dann bei jedem weiteren. Einmal Heben und Senken des Brustkorbs ist ein Atemzug; nicht beim Hecheln zählen.</>
        ) : (
          <>
            Bei jedem Atemzug tippen.{estimate ? (
              <>
                {" "}
                Hochgerechnet: <b style={{ color: "var(--ink)" }}>etwa {estimate} pro Minute</b>
              </>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}
