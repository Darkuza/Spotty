// Anmeldung mit E-Mail und Passwort; Zugänge legt ein Admin in der App an.
// Aufbau wie die Anmeldeseiten von iOS: Symbol, Name, gruppierte Felder, große Taste.

import { useState } from "react";
import { backend } from "../lib/config";
import { Group, Row } from "../ui/ios";

export function Brand({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.27 }} aria-hidden="true">
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.9 13.2H8l2.2-5 3.4 9.9 2.3-4.9H20" />
        <circle cx="18.2" cy="7.9" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="login-head">
      <Brand size={76} />
      <h1>{title}</h1>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}

export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="login">
      <form
        className="login-in"
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
        <Head title="Spotty" sub="Pflege, Protokoll und Akte" />
        <Group footer="Zugänge legt der Admin der Familie in der App an. Passwort vergessen: beim Admin ein neues setzen lassen.">
          <Row
            title="E-Mail"
            accessory={<input className="row-input left" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" placeholder="name@beispiel.de" aria-label="E-Mail" required />}
          />
          <Row title="Passwort" accessory={<input className="row-input left" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="erforderlich" aria-label="Passwort" required />} />
        </Group>
        {error ? (
          <p className="sheet-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="pill fill xl" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? "Meldet an …" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}

export function NoAccess({ email }: { email: string }) {
  return (
    <main className="login">
      <div className="login-in">
        <Head title="Kein Zugang" />
        <Group footer="Der Admin der Familie kann das Konto unter Profil → Familie freischalten.">
          <Row title="Angemeldet als" sub={email} wrap />
        </Group>
        <button type="button" className="pill gray xl" onClick={() => void backend.signOut()}>
          Abmelden
        </button>
      </div>
    </main>
  );
}

export function Splash({ text = "Lädt …", error, onRetry }: { text?: string; error?: string; onRetry?: () => void }) {
  return (
    <main className="login">
      <div className="login-in center">
        <Brand size={64} />
        <p className="login-msg">{error ? "Verbindung fehlgeschlagen" : text}</p>
        {error ? <p className="login-err">{error}</p> : null}
        {onRetry ? (
          <button type="button" className="pill gray" onClick={onRetry}>
            Erneut versuchen
          </button>
        ) : null}
      </div>
    </main>
  );
}
