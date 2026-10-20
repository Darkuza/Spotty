// Anmeldung und angemeldetes Mitglied.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { backend } from "./config";
import type { Session } from "./backend";
import { store, useRows } from "./store";
import type { Member } from "@shared/types.ts";

interface SessionState {
  ready: boolean;
  session: Session | null;
}

const Ctx = createContext<SessionState>({ ready: false, session: null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ ready: false, session: null });
  useEffect(() => {
    let alive = true;
    backend.getSession().then((s) => {
      if (alive) setState({ ready: true, session: s });
    });
    const off = backend.onAuth((s) => {
      setState((prev) => {
        if (prev.session?.userId === s?.userId && prev.ready) return prev;
        return { ready: true, session: s };
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  const userId = state.session?.userId;
  useEffect(() => {
    if (userId) void store.start(backend, userId);
    else store.stop();
  }, [userId]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  return useContext(Ctx);
}

export function useMembers(): Member[] {
  return useRows<Member>("members");
}

export function useMe(): Member | null {
  const { session } = useSession();
  const members = useMembers();
  if (!session) return null;
  return members.find((m) => m.user_id === session.userId) || null;
}

export function useNameOf(): (id: string | null | undefined) => string {
  const members = useMembers();
  return (id) => {
    if (!id) return "";
    const m = members.find((x) => x.user_id === id);
    return m ? m.name : "";
  };
}
