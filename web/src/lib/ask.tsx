// Fragen an Claude aus jeder Seite heraus stellen („Mit Claude besprechen“).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { navigate } from "./route";

interface AskApi {
  ask: (prompt: string) => void;
  prompt: string | null;
  used: () => void;
}

const Ctx = createContext<AskApi | null>(null);

export function AskProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const ask = useCallback((p: string) => {
    setPrompt(p);
    navigate("claude");
  }, []);
  const used = useCallback(() => setPrompt(null), []);
  const api = useMemo(() => ({ ask, prompt, used }), [ask, prompt, used]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAsk(): (prompt: string) => void {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AskProvider fehlt");
  return ctx.ask;
}

export function usePendingPrompt(): { prompt: string | null; used: () => void } {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AskProvider fehlt");
  return { prompt: ctx.prompt, used: ctx.used };
}
