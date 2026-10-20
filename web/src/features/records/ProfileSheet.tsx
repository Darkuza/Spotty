// Stammdaten der Akte bearbeiten: Angaben zu Spotty, Problemliste, Kontakte, Hinweise.

import { useState } from "react";
import type { Profile, ProfileData } from "@shared/types.ts";
import { isValidDay } from "@shared/dates.ts";
import { saveProfile } from "../../lib/data";
import { newId } from "../../lib/store";
import { Sheet } from "../../ui/overlays";
import { AreaField, TextField } from "../../ui/controls";
import { Icon } from "../../ui/Icon";

type Problem = NonNullable<ProfileData["problems"]>[number];
type Contact = NonNullable<ProfileData["contacts"]>[number];

function linesOf(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** "Bezeichnung: Text" je Zeile */
function pairsOf(s: string): [string, string][] {
  return linesOf(s).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ["", l];
  });
}

export function ProfileSheet({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const d: ProfileData = profile?.data || {};
  const [name, setName] = useState(d.name || "Spotty");
  const [breed, setBreed] = useState(d.breed || "");
  const [sex, setSex] = useState(d.sex || "");
  const [born, setBorn] = useState(d.born || "");
  const [owner, setOwner] = useState(d.owner || "");
  const [weightNormal, setWeightNormal] = useState(d.weight_normal || "");
  const [principle, setPrinciple] = useState(d.guiding_principle || "");
  const [family, setFamily] = useState(d.family || "");
  const [care, setCare] = useState((d.care_notes || []).join("\n"));
  const [allergies, setAllergies] = useState((d.allergies || []).map((a) => `${a.source}: ${a.items.join(", ")}`).join("\n"));
  const [history, setHistory] = useState((d.history || []).map((h) => `${h.date}: ${h.text}`).join("\n"));
  const [devices, setDevices] = useState((d.devices || []).map((x) => (x.note ? `${x.name}: ${x.note}` : x.name)).join("\n"));
  const [notes, setNotes] = useState(d.notes || "");
  const [problems, setProblems] = useState<Problem[]>(d.problems || []);
  const [contacts, setContacts] = useState<Contact[]>(d.contacts || []);

  const save = () => {
    const data: ProfileData = {
      ...d,
      name: name.trim() || "Spotty",
      breed: breed.trim() || undefined,
      sex: sex.trim() || undefined,
      born: isValidDay(born) ? born : d.born,
      owner: owner.trim() || undefined,
      weight_normal: weightNormal.trim() || undefined,
      guiding_principle: principle.trim() || undefined,
      family: family.trim() || undefined,
      care_notes: linesOf(care),
      allergies: pairsOf(allergies).map(([source, items]) => ({ source: source || "ohne Quelle", items: items.split(",").map((x) => x.trim()).filter(Boolean) })),
      history: pairsOf(history).map(([date, text]) => ({ date, text })),
      devices: pairsOf(devices).map(([n, note]) => (n ? { name: n, note: note || null } : { name: note, note: null })),
      notes: notes.trim() || undefined,
      problems: problems.filter((p) => p.title.trim()),
      contacts: contacts.filter((c) => c.name.trim()),
    };
    saveProfile({ id: 1, data });
    onClose();
  };

  const setP = (i: number, patch: Partial<Problem>) => setProblems((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setC = (i: number, patch: Partial<Contact>) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = <T,>(list: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const out = [...list];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };

  return (
    <Sheet
      title="Akte bearbeiten"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save} style={{ flex: 2 }}>
            Speichern
          </button>
        </>
      }
    >
      <div className="section-title">
        <h2>Stammdaten</h2>
      </div>
      <div className="grid-2">
        <TextField label="Name" value={name} onChange={setName} />
        <TextField label="Rasse" value={breed} onChange={setBreed} />
        <TextField label="Geschlecht" value={sex} onChange={setSex} />
        <div className="field">
          <label htmlFor="pf-born">Geboren</label>
          <input id="pf-born" type="date" value={born} onChange={(e) => setBorn(e.target.value)} />
        </div>
        <TextField label="Halterin / Halter" value={owner} onChange={setOwner} />
        <TextField label="Normalgewicht früher" value={weightNormal} onChange={setWeightNormal} />
      </div>
      <AreaField label="Leitlinie der Familie" value={principle} onChange={setPrinciple} rows={3} />
      <AreaField label="Familie und Aufgaben (wer pflegt, wer spricht mit der Klinik)" value={family} onChange={setFamily} rows={2} />

      <div className="section-title">
        <h2>Problemliste</h2>
        <button className="link-btn" onClick={() => setProblems((ps) => [...ps, { id: `p-${newId().slice(0, 6)}`, title: "", status: "", since: null, details: "", sources: [] }])}>
          + Problem
        </button>
      </div>
      {problems.map((p, i) => (
        <div key={p.id} className="card stack-s">
          <div className="row between">
            <b className="num">{i + 1}</b>
            <span className="row" style={{ gap: 4 }}>
              <button className="icon-btn" onClick={() => setProblems((ps) => move(ps, i, -1))} aria-label="Nach oben" disabled={i === 0}>
                <Icon name="send" size={18} />
              </button>
              <button className="icon-btn" onClick={() => setProblems((ps) => ps.filter((_, j) => j !== i))} aria-label="Entfernen">
                <Icon name="trash" size={18} />
              </button>
            </span>
          </div>
          <TextField label="Bezeichnung" value={p.title} onChange={(v) => setP(i, { title: v })} />
          <div className="grid-2">
            <TextField label="Stand" value={p.status || ""} onChange={(v) => setP(i, { status: v })} placeholder="z. B. in Abklärung" />
            <TextField label="Seit" value={p.since || ""} onChange={(v) => setP(i, { since: v || null })} placeholder="JJJJ-MM-TT" />
          </div>
          <AreaField label="Details" value={p.details || ""} onChange={(v) => setP(i, { details: v })} rows={3} />
        </div>
      ))}

      <div className="section-title">
        <h2>Kontakte</h2>
        <button className="link-btn" onClick={() => setContacts((cs) => [...cs, { name: "", role: "", phone: "", address: "", note: "" }])}>
          + Kontakt
        </button>
      </div>
      {contacts.map((c, i) => (
        <div key={i} className="card stack-s">
          <div className="row between">
            <b>{c.name || "Neuer Kontakt"}</b>
            <span className="row" style={{ gap: 4 }}>
              <button className="icon-btn" onClick={() => setContacts((cs) => move(cs, i, -1))} aria-label="Nach oben" disabled={i === 0}>
                <Icon name="send" size={18} />
              </button>
              <button className="icon-btn" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} aria-label="Entfernen">
                <Icon name="trash" size={18} />
              </button>
            </span>
          </div>
          <TextField label="Name" value={c.name} onChange={(v) => setC(i, { name: v })} />
          <div className="grid-2">
            <TextField label="Rolle" value={c.role || ""} onChange={(v) => setC(i, { role: v })} placeholder="z. B. behandelnde Klinik" />
            <TextField label="Telefon" value={c.phone || ""} onChange={(v) => setC(i, { phone: v })} type="tel" />
          </div>
          <TextField label="Adresse" value={c.address || ""} onChange={(v) => setC(i, { address: v })} />
          <TextField label="Notiz" value={c.note || ""} onChange={(v) => setC(i, { note: v })} />
        </div>
      ))}
      <p className="hint">Die Notfall-Taste wählt den Kontakt, dessen Rolle „behandelnd“ oder „aktuell“ enthält, sonst den ersten mit Telefonnummer.</p>

      <div className="section-title">
        <h2>Weitere Angaben</h2>
      </div>
      <AreaField label="Pflegehinweise (eine Zeile je Hinweis)" value={care} onChange={setCare} rows={6} />
      <AreaField label="Unverträglichkeiten („Quelle: Stoff, Stoff, …“ je Zeile)" value={allergies} onChange={setAllergies} rows={4} />
      <AreaField label="Vorgeschichte („Datum: Text“ je Zeile)" value={history} onChange={setHistory} rows={5} />
      <AreaField label="Geräte („Gerät: Notiz“ je Zeile)" value={devices} onChange={setDevices} rows={4} />
      <AreaField label="Sonstige Notizen" value={notes} onChange={setNotes} rows={3} />
    </Sheet>
  );
}
