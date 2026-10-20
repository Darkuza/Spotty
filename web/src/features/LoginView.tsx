// Anmeldung mit E-Mail und Passwort; Zugänge legt ein Admin in der App an.

import { useState } from "react";
import { backend } from "../lib/config";
import { TextField } from "../ui/controls";

export function Brand({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.9 13.2H8l2.2-5 3.4 9.9 2.3-4.9H20" />
        <circle cx="18.2" cy="7.9" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="login wrap">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await backend.signIn(email, password);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="row">
          <Brand size={44} />
          <div>
            <h1>Spotty</h1>
            <p className="muted small">Pflege, Protokoll und Akte</p>
          </div>
        </div>
        <TextField label="E-Mail" value={email} onChange={setEmail} type="email" autoComplete="username" inputMode="email" />
        <TextField label="Passwort" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
        {error ? (
          <div className="banner warn" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <button className="btn primary block" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? "Meldet an …" : "Anmelden"}
        </button>
        <p className="hint">Zugänge legt der Admin der Familie in der App an. Passwort vergessen: beim Admin ein neues setzen lassen.</p>
      </form>
    </main>
  );
}

export function NoAccess({ email }: { email: string }) {
  return (
    <main className="login wrap">
      <div className="card">
        <div className="row">
          <Brand size={44} />
          <h1>Kein Zugang</h1>
        </div>
        <p>
          Das Konto <b>{email}</b> ist angemeldet, aber nicht als Mitglied eingetragen. Der Admin kann es unter Einstellungen → Mitglieder freischalten.
        </p>
        <button className="btn ghost" onClick={() => void backend.signOut()}>
          Abmelden
        </button>
      </div>
    </main>
  );
}

export function Splash({ text = "Lädt …", error, onRetry }: { text?: string; error?: string; onRetry?: () => void }) {
  return (
    <main className="login wrap">
      <div className="stack" style={{ alignItems: "center", textAlign: "center" }}>
        <Brand size={52} />
        <p className="muted">{error ? "Verbindung fehlgeschlagen" : text}</p>
        {error ? <p className="hint">{error}</p> : null}
        {onRetry ? (
          <button className="btn ghost" onClick={onRetry}>
            Erneut versuchen
          </button>
        ) : null}
      </div>
    </main>
  );
}
