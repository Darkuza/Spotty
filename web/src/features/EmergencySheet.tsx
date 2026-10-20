// Notfall: Klinik anrufen, Warnzeichen, was bis zur Hilfe zu tun ist, Kurzinfo für fremde Tierärzte.

import { useChecks, useEntries, usePhotos, useProfile, useRegimens } from "../lib/data";
import { clinicPhone, telHref } from "../lib/profile";
import { copyText } from "../lib/files";
import { Sheet, useToast } from "../ui/overlays";
import { Icon } from "../ui/Icon";
import { ageAt, berlinNow, fmtDMY, fmtDayShort } from "@shared/dates.ts";
import { itemState, itemsForDay } from "@shared/plan.ts";
import { fmtNum, num } from "@shared/entryTypes.ts";
import { dayStats } from "@shared/stats.ts";
import type { Check, Entry, Photo, Profile, Regimen } from "@shared/types.ts";

const SIGNS = [
  "Atemzüge in Ruhe oder im Schlaf anhaltend über 40 pro Minute oder rasch steigend, Atmen mit offenem Maul, angestrengte Bauchatmung",
  "Zunge oder Zahnfleisch blass, grau oder bläulich",
  "SpO₂ unter 90 % trotz Sauerstoff, oder unter 95 %, das sich mit Sauerstoff nicht bessert",
  "Zusammenbruch, Ohnmacht, plötzliche starke Schwäche",
  "Schwarzer, klebriger Kot oder Erbrechen mit Blut oder kaffeesatzartigem Inhalt",
  "Wiederholtes Erbrechen, starke Schmerzen, aufgekrümmter Rücken, harter Bauch",
  "Husten mit Blut",
  "Frisst und trinkt seit mehr als 24 Stunden nichts",
];

const MEANWHILE = [
  "Ruhig bleiben und ruhig sprechen; Aufregung erhöht den Sauerstoffbedarf.",
  "Sauerstoff vor die Nase halten (Flow-by), Kopf leicht erhöht, kühl lagern.",
  "Nichts füttern und nicht mit der Spritze trinken lassen, solange er schwer atmet.",
  "Zum Transport liegend tragen, nicht laufen lassen.",
  "Die Kurzinfo unten kopieren oder vorzeigen; Medikamentenschachteln mitnehmen.",
];

function summaryText(profile: Profile | null, regimens: Regimen[], checks: Check[], entries: Entry[], photos: Photo[]): string {
  const now = berlinNow();
  const d = profile?.data || {};
  const lines: string[] = [`${d.name || "Spotty"} – Kurzinfo für den Notdienst (Stand ${fmtDMY(now.day)} ${now.hm})`];
  const age = d.born ? ageAt(d.born, now.day) : null;
  const weights = entries.filter((e) => e.type === "gewicht").sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));
  const w = weights[0] ? num((weights[0].data as Record<string, unknown>).kg) : null;
  lines.push([d.species, d.breed, d.sex, d.born ? `geb. ${fmtDMY(d.born)}${age ? ` (${age.years} J.)` : ""}` : "", w != null ? `${fmtNum(w, 1)} kg am ${fmtDMY(weights[0].day)}` : ""].filter(Boolean).join(", "));
  if (d.owner) lines.push(`Halterin: ${d.owner}`);
  if (d.problems?.length) {
    lines.push("", "Probleme:");
    d.problems.forEach((p, i) => lines.push(`${i + 1}. ${p.title}${p.status ? ` (${p.status})` : ""}`));
  }
  const items = itemsForDay(regimens, now.day).filter((it) => it.category === "med" || it.category === "inh");
  if (items.length) {
    lines.push("", `Medikamente heute (${fmtDayShort(now.day)}):`);
    for (const it of items) {
      const st = itemState(it, now.day, checks, entries, photos);
      lines.push(`- ${it.time} ${it.title}${st.done ? ` – gegeben ${st.at}` : ""}`);
    }
  }
  if (d.allergies?.length) {
    lines.push("", "Unverträglichkeiten:");
    for (const a of d.allergies) lines.push(`- ${a.items.join(", ")} (${a.source})`);
  }
  const today = dayStats(entries, now.day);
  const last = [...entries].filter((e) => e.type === "atem").sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time))[0];
  const lastSpo = [...entries].filter((e) => e.type === "spo2").sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time))[0];
  const vals: string[] = [];
  if (last) vals.push(`Atemzüge ${fmtNum(num((last.data as Record<string, unknown>).bpm))}/min (${fmtDayShort(last.day)} ${last.time})`);
  if (lastSpo) vals.push(`SpO₂ ${fmtNum(num((lastSpo.data as Record<string, unknown>).pct))} % (${fmtDayShort(lastSpo.day)} ${lastSpo.time})`);
  if (today.trinkenN) vals.push(`heute getrunken ${fmtNum(today.trinkenMl)} ml`);
  if (vals.length) lines.push("", `Letzte Werte: ${vals.join(" · ")}`);
  const contacts = (d.contacts || []).filter((c) => c.phone);
  if (contacts.length) {
    lines.push("", "Kontakte:");
    for (const c of contacts.slice(0, 4)) lines.push(`- ${c.name}${c.role ? ` (${c.role})` : ""}: ${c.phone}`);
  }
  return lines.join("\n");
}

export function EmergencySheet({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const regimens = useRegimens();
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const toast = useToast();
  const phone = clinicPhone(profile);
  const main = (profile?.data?.contacts || []).find((c) => c.phone && c.phone === phone);
  const others = (profile?.data?.contacts || []).filter((c) => c.phone && c !== main);
  const text = summaryText(profile, regimens, checks, entries, photos);
  return (
    <Sheet title="Notfall" onClose={onClose}>
      {phone ? (
        <a className="btn danger block" href={telHref(phone)} style={{ minHeight: 60, fontSize: 18 }}>
          <Icon name="phone" /> {main?.name ? `${main.name} anrufen` : "Klinik anrufen"}
        </a>
      ) : (
        <div className="banner warn">
          <div className="head">Keine Kliniknummer hinterlegt</div>
          <p>Unter Akte → Übersicht → Bearbeiten → Kontakte eintragen.</p>
        </div>
      )}
      {phone ? (
        <p className="num" style={{ textAlign: "center", fontSize: 20, fontWeight: 700, userSelect: "all" }}>
          {phone}
        </p>
      ) : null}
      {others.length ? (
        <div className="card flush">
          {others.map((c, i) => (
            <div key={i} className="erow" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
              <span>
                <span className="s" style={{ display: "block" }}>
                  {c.name}
                </span>
                <span className="x num" style={{ display: "block" }}>
                  {[c.role, c.phone].filter(Boolean).join(" · ")}
                </span>
              </span>
              <a className="btn small ghost" href={telHref(c.phone || "")}>
                <Icon name="phone" size={18} /> Anrufen
              </a>
            </div>
          ))}
        </div>
      ) : null}

      <div className="section-title">
        <h2>Sofort anrufen bei</h2>
      </div>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 20 }} className="stack-s">
          {SIGNS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="section-title">
        <h2>Bis Hilfe da ist</h2>
      </div>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 20 }} className="stack-s">
          {MEANWHILE.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="section-title">
        <h2>Kurzinfo für fremde Tierärzte</h2>
      </div>
      <pre className="card mono small" style={{ whiteSpace: "pre-wrap", margin: 0, overflowWrap: "anywhere" }}>
        {text}
      </pre>
      <button
        className="btn ghost"
        onClick={async () => {
          const ok = await copyText(text);
          toast.show(ok ? "Kurzinfo kopiert" : "Kopieren nicht möglich", { error: !ok });
        }}
      >
        <Icon name="copy" size={20} /> Kurzinfo kopieren
      </button>
    </Sheet>
  );
}
