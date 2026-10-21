// Mitglieder verwalten (nur Admins): Konten mit Startpasswort anlegen, Rolle ändern, Passwort zurücksetzen, entfernen.

import { useEffect, useState } from "react";
import { backend } from "../../lib/config";
import { useSession } from "../../lib/session";
import { berlinOfIso, fmtDMY } from "@shared/dates.ts";
import { Sheet, useConfirm, useSheets, useToast } from "../../ui/overlays";
import { Chips, Field, TextField } from "../../ui/controls";
import { Icon } from "../../ui/Icon";

interface MemberRow {
  user_id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  last_sign_in_at?: string | null;
}

function randomPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("").replace(/(.{4})(?!$)/g, "$1-");
}

export function MembersSheet({ onClose }: { onClose: () => void }) {
  const { session } = useSession();
  const sheets = useSheets();
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const r = await backend.invoke<{ members: MemberRow[] }>("admin-users", { action: "list" });
      setRows(r.members || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const edit = (m: MemberRow | null) => sheets.open((close) => <MemberSheet member={m} self={m?.user_id === session?.userId} onClose={close} onSaved={() => void load()} />);
  return (
    <Sheet
      title="Mitglieder"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={() => edit(null)}>
          <Icon name="plus" size={20} /> Mitglied anlegen
        </button>
      }
    >
      <p className="hint">Wer hier eingetragen ist, sieht und bearbeitet alles zu Spotty. Selbst registrieren kann sich niemand.</p>
      {error ? (
        <div className="banner warn">
          <div className="head">Liste nicht geladen</div>
          <p>{error}</p>
        </div>
      ) : null}
      {!rows && !error ? <p className="hint">Lädt …</p> : null}
      {rows ? (
        <div className="card flush">
          {rows.map((m) => (
            <button key={m.user_id} className="erow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} onClick={() => edit(m)}>
              <span>
                <span className="s" style={{ display: "block" }}>
                  {m.name}
                  {m.user_id === session?.userId ? <span className="muted"> (du)</span> : null}
                </span>
                <span className="x" style={{ display: "block", overflowWrap: "anywhere" }}>
                  {m.email} · {m.role === "admin" ? "Admin" : "Mitglied"}
                </span>
                <span className="x" style={{ display: "block" }}>
                  {m.last_sign_in_at ? `zuletzt angemeldet ${fmtDMY(berlinOfIso(m.last_sign_in_at).day)}` : "noch nie angemeldet"}
                </span>
              </span>
              <Icon name="right" size={20} />
            </button>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

function MemberSheet({ member, self, onClose, onSaved }: { member: MemberRow | null; self: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(member?.name || "");
  const [email, setEmail] = useState(member?.email || "");
  const [role, setRole] = useState<"admin" | "member">(member?.role || "member");
  const [password, setPassword] = useState(member ? "" : randomPassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      if (!member) {
        await backend.invoke("admin-users", { action: "create", name: name.trim(), email: email.trim(), password, role });
        setDone(`Konto angelegt. Bitte ${name.trim()} diese Zugangsdaten persönlich geben:\n\nAdresse: ${location.origin}${location.pathname}\nE-Mail: ${email.trim()}\nStartpasswort: ${password}\n\nDas Passwort lässt sich nach der Anmeldung unter Mehr ändern.`);
      } else {
        const body: Record<string, unknown> = { action: "update", user_id: member.user_id, name: name.trim(), role };
        if (password) body.password = password;
        await backend.invoke("admin-users", body);
        toast.show(password ? "Gespeichert, neues Passwort gesetzt" : "Gespeichert");
        onClose();
      }
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e), { error: true, ms: 6000 });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!member) return;
    if (!(await confirm({ title: `${member.name} entfernen?`, text: "Das Konto wird gelöscht; Einträge und Häkchen bleiben erhalten.", confirm: "Entfernen", danger: true }))) return;
    setBusy(true);
    try {
      await backend.invoke("admin-users", { action: "remove", user_id: member.user_id });
      onSaved();
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e), { error: true });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Sheet title="Zugang angelegt" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Fertig</button>}>
        <p style={{ whiteSpace: "pre-wrap" }} className="mono small">
          {done}
        </p>
        <button
          className="btn ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(done);
              toast.show("Kopiert");
            } catch {
              toast.show("Kopieren nicht möglich – bitte abschreiben", { error: true });
            }
          }}
        >
          <Icon name="copy" size={20} /> Kopieren
        </button>
        <p className="hint">Am besten mündlich oder per Messenger mit Ende-zu-Ende-Verschlüsselung weitergeben, nicht per E-Mail.</p>
      </Sheet>
    );
  }

  const valid = name.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && (member ? !password || password.length >= 8 : password.length >= 8);
  return (
    <Sheet
      title={member ? member.name : "Mitglied anlegen"}
      onClose={onClose}
      footer={
        <>
          {member && !self ? (
            <button className="btn danger" onClick={() => void remove()} disabled={busy}>
              Entfernen
            </button>
          ) : (
            <button className="btn ghost" onClick={onClose}>
              Abbrechen
            </button>
          )}
          <button className="btn primary" onClick={() => void save()} disabled={!valid || busy} style={{ flex: 2 }}>
            {busy ? "Speichert …" : member ? "Speichern" : "Anlegen"}
          </button>
        </>
      }
    >
      <TextField label="Name (so erscheint er bei Häkchen und Einträgen)" value={name} onChange={setName} autoComplete="off" />
      {member ? (
        <p className="small">
          E-Mail: <b>{member.email}</b>
        </p>
      ) : (
        <TextField label="E-Mail" value={email} onChange={setEmail} type="email" autoComplete="off" inputMode="email" />
      )}
      <Field label="Rolle">
        <Chips
          options={[
            ["member", "Mitglied"],
            ["admin", "Admin"],
          ]}
          value={role}
          onChange={(v) => setRole((v as "admin" | "member") || role)}
          allowEmpty={false}
        />
      </Field>
      <p className="hint">Admins können zusätzlich Mitglieder verwalten.</p>
      <TextField
        label={member ? "Neues Passwort (leer lassen = unverändert)" : "Startpasswort"}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={
          <button type="button" className="link-btn" onClick={() => setPassword(randomPassword())}>
            Zufälliges Passwort erzeugen
          </button>
        }
      />
    </Sheet>
  );
}
