// Atemzähler: bei jedem Atemzug auf die Fläche tippen; nach 30 (oder 60) Sekunden wird auf eine Minute hochgerechnet.

import { useEffect, useRef, useState } from "react";

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

  const remaining = Math.max(0, Math.ceil(duration - elapsed));
  const estimate = start !== null && elapsed >= 8 && !done ? Math.round((count * 60) / Math.max(elapsed, 1)) : null;
  const result = done ? Math.round((count * 60) / duration) : null;

  return (
    <div className="counter">
      <div className="row between">
        <div className="chips" role="group" aria-label="Zähldauer">
          {[30, 60].map((d) => (
            <button key={d} className="chip small" aria-pressed={duration === d} disabled={start !== null && !done} onClick={() => setDuration(d as 30 | 60)}>
              {d} Sekunden
            </button>
          ))}
        </div>
        <button className="link-btn" onClick={reset}>
          Neu zählen
        </button>
      </div>
      <button
        type="button"
        className={`ctpad${done ? " done" : ""}`}
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
        aria-label="Bei jedem Atemzug tippen"
      >
        <span className="n num">{done ? result : count}</span>
        <span>
          {done
            ? `Atemzüge pro Minute (${count} in ${duration} s)`
            : start === null
              ? "Beim ersten Atemzug tippen – dann bei jedem weiteren"
              : `noch ${remaining} s${estimate ? ` · etwa ${estimate}/min` : ""}`}
        </span>
      </button>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (elapsed / duration) * 100)}%` }} />
      </div>
      <p className="hint">Auf den Brustkorb schauen: einmal Heben und Senken ist ein Atemzug. Am besten im Schlaf oder wenn er ruhig liegt, nicht beim Hecheln.</p>
    </div>
  );
}
