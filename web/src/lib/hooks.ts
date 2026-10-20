import { useEffect, useState } from "react";
import { berlinNow, type BerlinNow } from "@shared/dates.ts";

/** Aktuelle Berliner Zeit, aktualisiert alle paar Sekunden und beim Zurückkehren in die App. */
export function useNow(intervalMs = 5000): BerlinNow {
  const [now, setNow] = useState<BerlinNow>(() => berlinNow());
  useEffect(() => {
    const tick = () => {
      const n = berlinNow();
      setNow((prev) => (prev.hm === n.hm && prev.day === n.day ? prev : n));
    };
    const id = setInterval(tick, intervalMs);
    const vis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [intervalMs]);
  return now;
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, JSON.stringify(nv));
    } catch {
      /* gesperrt */
    }
  };
  return [v, set];
}
