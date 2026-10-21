// Notfall: Klinik anrufen, Warnzeichen, was bis zur Hilfe zu tun ist, Kurzinfo für fremde Tierärzte.

import { useChecks, useEntries, usePhotos, useProfile, useRegimens } from "../lib/data";
import { clinicPhone, telHref } from "../lib/profile";
import { copyText } from "../lib/files";
import { Sheet, useToast } from "../ui/overlays";
import { Glyph } from "../ui/Glyph";
import { Group, Pill, Row } from "../ui/ios";
import { ageAt, berlinNow, fmtDMY, fmtDayShort } from "@shared/dates.ts";
import { itemState, itemsForDay } from "@shared/plan.ts";
import { fmtNum, num } from "@shared/entryTypes.ts";
import { dayStats } from "@shared/stats.ts";
import type { Check, Entry, Photo, Profile, Regimen } from "@shared/types.ts";
import { MEANWHILE, SIGNS } from "./articles/articles";

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
      lines.push(`- ${it.time} ${it.title}${st.skipped ? " – ausgelassen" : st.done ? ` – gegeben ${st.at}` : ""}`);
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
  const contacts = (d.contacts || []).filter((c) => c.phone || c.emergency);
  if (contacts.length) {
    lines.push("", "Kontakte:");
    for (const c of contacts.slice(0, 4)) lines.push(`- ${c.name}${c.role ? ` (${c.role})` : ""}: ${[c.phone, c.emergency ? `Notdienst ${c.emergency}` : ""].filter(Boolean).join(", ")}`);
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
  const contacts = profile?.data?.contacts || [];
  const main = contacts.find((c) => c.phone && c.phone === phone);
  const emergency = contacts.find((c) => c.emergency)?.emergency || null;
  const others = contacts.filter((c) => (c.phone || c.emergency) && c !== main);
  const text = summaryText(profile, regimens, checks, entries, photos);
  return (
    <Sheet title="Notfall" onClose={onClose}>
      <div className="sos-head">
        <span className="sos-ic" aria-hidden="true">
          <Glyph name="phone" size={30} />
        </span>
        {phone ? (
          <>
            <Pill kind="fill" tone="red" href={telHref(phone)} ariaLabel={main?.name ? `${main.name} anrufen` : "Klinik anrufen"}>
              Klinik anrufen
            </Pill>
            {main?.name ? <p className="sos-name">{main.name}</p> : null}
            <p className="sos-num" aria-label={`Nummer ${phone}`}>
              {phone}
            </p>
          </>
        ) : (
          <p className="sos-miss">Keine Kliniknummer hinterlegt. Unter Profil → Gesundheitsdetails → Bearbeiten → Kontakte eintragen.</p>
        )}
        {emergency ? (
          <Pill kind="tint" tone="red" href={telHref(emergency)}>
            Notdienst {emergency}
          </Pill>
        ) : null}
      </div>
      {others.length ? (
        <Group header="Weitere Kontakte">
          {others.map((c, i) => (
            <Row key={i} title={c.name} wrap sub={[c.phone, c.emergency ? `Notdienst ${c.emergency}` : ""].filter(Boolean).join(" · ")} href={telHref(c.phone || c.emergency || "")} accessory={<span className="row-call">Anrufen</span>} ariaLabel={`${c.name} anrufen`} />
          ))}
        </Group>
      ) : null}
      <Group header="Sofort anrufen bei">
        {SIGNS.map((s) => (
          <Row key={s} glyph="alert" color="var(--red)" title={s} wrap />
        ))}
      </Group>
      <Group header="Bis Hilfe da ist">
        {MEANWHILE.map((s, i) => (
          <Row key={s} title={s} wrap accessory={<span className="row-num">{i + 1}</span>} />
        ))}
      </Group>
      <Group header="Kurzinfo für fremde Tierärzte" footer="Kopieren und schicken oder vorzeigen. Enthält Probleme, heutige Medikamente, Unverträglichkeiten, letzte Werte und Kontakte.">
        <pre className="grp-pre">{text}</pre>
        <Row
          title="Kurzinfo kopieren"
          tone="blue"
          onClick={async () => {
            const ok = await copyText(text);
            toast.show(ok ? "Kurzinfo kopiert" : "Kopieren nicht möglich", { error: !ok });
          }}
        />
      </Group>
    </Sheet>
  );
}
