// Seite eines Medikaments: oben das Foto des Wirkstoffs (sonst die Strukturformel), dann die Dosis für Spotty
// aus dem Plan, eine Erklärung, wie der Wirkstoff wirkt, die Strukturformel, Hinweise, Plandetails, Belege aus der Akte und Quellen.

import { useState, type CSSProperties } from "react";
import { useNowValue } from "../../lib/now";
import { useAsk } from "../../lib/ask";
import { openSub } from "../../lib/route";
import { useSheets } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { CircleButton, Group, NavBar, Row, Screen, SectionHead } from "../../ui/ios";
import { STATUS_TITLE, doseInfo, findMedication, glyphOf, groupOf, type Evidence, type MedItem, type MedStatus } from "../../lib/medications";
import { fmtDate, fmtSpan, plural } from "../../lib/health/format";
import { PlanSheet, RegimenSheet } from "../settings/PlanEditor";
import { RegimenPage, RegimenSections } from "../plan/RegimenPage";
import { keepUnits } from "../plan/MedsPage";
import type { Regimen } from "@shared/types.ts";
import type { Substance } from "./catalog";
import { MoleculeBlock } from "./Molecule";
import { STRUCTURES } from "./structures.generated";
import { photoUrl } from "./photos";
import { useMedications } from "./useMedications";

const TAG: Record<MedStatus, string> = { aktuell: "tagc", geplant: "tagc orange", frueher: "tagc gray", moeglich: "tagc gray" };

/** Adresse aus der Liste (Wirkstoff) oder aus alten Links (Plan-Kennung): erst die Medikamentenzeile, sonst die einfache Planseite. */
export function MedicationRoute({ k, back }: { k: string; back: string }) {
  const item = findMedication(useMedications(), k);
  return item ? <MedicationPage item={item} back={back} /> : <RegimenPage id={k} back={back} />;
}

function Hero({ item }: { item: MedItem }) {
  const s = item.substance;
  const photo = s?.photo ? { ...s.photo, src: photoUrl(s.photo.file) } : null;
  if (photo && photo.src) {
    return (
      <figure className="mhero image">
        <img src={photo.src} alt={photo.alt} />
        <figcaption className="mhero-cap">
          <span className="mhero-what">{photo.caption}</span>
          <span className="mhero-cr">
            Foto: {photo.author} ·{" "}
            {photo.licenseUrl ? (
              <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">
                {photo.license}
              </a>
            ) : (
              photo.license
            )}
            {photo.changes ? ` (${photo.changes})` : ""} ·{" "}
            <a href={photo.url} target="_blank" rel="noopener noreferrer">
              Wikimedia Commons
            </a>
          </span>
        </figcaption>
      </figure>
    );
  }
  const first = s?.molecules[0];
  if (s && first && STRUCTURES[first.id]) {
    return (
      <div className="mhero formula">
        <MoleculeBlock mref={first} name={s.name} kicker="Strukturformel" />
      </div>
    );
  }
  return (
    <div className="mhero glyph" aria-hidden="true">
      <Glyph name={glyphOf(item)} size={64} />
    </div>
  );
}

function DoseBlock({ r, today, named }: { r: Regimen; today: string; named: boolean }) {
  const d = doseInfo(r, today);
  const line = [d.times, d.hint].filter(Boolean).join(" · ");
  return (
    <div className="mdose">
      <span className="mdose-k">{named ? r.name : "Dosis für Spotty"}</span>
      <span className="mdose-v">{keepUnits(d.headline)}</span>
      {d.total ? <span className="mdose-s">{keepUnits(d.total)}</span> : null}
      {line ? <span className="mdose-s">{keepUnits(line)}</span> : null}
      {d.today ? <span className="mdose-s">{d.today}</span> : null}
      {d.next ? <span className="mdose-s">{keepUnits(d.next)}</span> : null}
    </div>
  );
}

function evidenceMeta(e: Evidence): string {
  const when = e.day ? (e.until ? fmtSpan(e.day, e.until) : fmtDate(e.day)) : "";
  const kind = e.kind === "eintrag" ? plural(e.count || 1, "Eintrag", "Einträge") : e.kind === "frage" ? (e.state === "geklaert" ? "Frage, geklärt" : "Frage, offen") : "";
  return [when, kind, e.guess ? "Zuordnung vermutet" : ""].filter(Boolean).join(" · ");
}

function openEvidence(e: Evidence) {
  if (e.kind === "frage") openSub("akte/fragen");
  else if (e.kind === "eintrag") openSub(`protokoll/${e.day}`);
  else openSub(e.documentId ? `akte/dokument/${e.documentId}` : "akte/chronik");
}

const EVIDENCE_GLYPH: Record<Evidence["kind"], string> = { eintrag: "notes", ereignis: "clock", frage: "question" };
const SHOWN = 5;

function EvidenceGroup({ list }: { list: Evidence[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <Group header="Aus der Akte">
      {shown.map((e) => (
        <Row
          key={e.key}
          glyph={EVIDENCE_GLYPH[e.kind]}
          color="var(--label-2)"
          title={e.title}
          sub={
            <>
              {evidenceMeta(e)}
              {e.text ? (
                <>
                  <br />
                  {e.text}
                </>
              ) : null}
            </>
          }
          wrap
          chevron
          onClick={() => openEvidence(e)}
        />
      ))}
      {list.length > SHOWN ? <Row title={all ? "Weniger anzeigen" : `Alle ${list.length} anzeigen`} tone="blue" onClick={() => setAll(!all)} /> : null}
    </Group>
  );
}

function SubstanceSections({ s, hasPhoto }: { s: Substance; hasPhoto: boolean }) {
  // Ohne Foto steht die erste Strukturformel schon oben auf der Seite.
  const rest = hasPhoto ? s.molecules : s.molecules.slice(1);
  return (
    <>
      <Group header="Was ist das?">
        <div className="mtext">
          <p>{s.what}</p>
        </div>
        {s.brands && s.brands.length ? <Row title="Handelsnamen" value={s.brands.join(", ")} wrap /> : null}
      </Group>

      <Group header="Wie wirkt es?">
        <ol className="msteps">
          {s.how.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </Group>

      {rest.length ? (
        <Group header={hasPhoto ? (rest.length > 1 ? "Strukturformeln" : "Strukturformel") : rest.length > 1 ? "Weitere Strukturformeln" : "Weitere Strukturformel"}>
          {rest.map((m) => (
            <div className="mmol" key={m.id}>
              <MoleculeBlock mref={m} name={s.name} />
            </div>
          ))}
        </Group>
      ) : null}

      {s.facts ? (
        <Group header={s.facts.title}>
          {s.facts.rows.map((r) => (
            <Row key={r.label} title={r.label} value={r.value} />
          ))}
        </Group>
      ) : null}

      {s.know.length ? (
        <Group header="Gut zu wissen">
          <ul className="mbul">
            {s.know.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Group>
      ) : null}
    </>
  );
}

export function MedicationPage({ item, back }: { item: MedItem; back: string }) {
  const now = useNowValue();
  const sheets = useSheets();
  const ask = useAsk();
  const s = item.substance;
  const hasPhoto = !!(s?.photo && photoUrl(s.photo.file));
  const multi = item.regimens.length > 1;
  const edit =
    item.regimens.length === 1 ? (
      <CircleButton icon="edit" label="Bearbeiten" onClick={() => sheets.open((close) => <RegimenSheet regimen={item.regimens[0]} onClose={close} />)} />
    ) : item.regimens.length > 1 ? (
      <CircleButton icon="edit" label="Plan bearbeiten" onClick={() => sheets.open((close) => <PlanSheet onClose={close} />)} />
    ) : null;
  const sub = s && s.name !== item.name ? `${s.name} · ${s.group}` : s ? s.group : groupOf(item);
  const lastLine = item.lastGiven ? `Zuletzt gegeben am ${fmtDate(item.lastGiven)}.` : item.last ? `Zuletzt erwähnt am ${fmtDate(item.last)}.` : "";
  return (
    <Screen>
      <NavBar title={item.name} back={back} trailing={edit} />
      <Hero item={item} />
      <div className="mhead" style={{ "--cat": "var(--c-medikamente)" } as CSSProperties}>
        <h1 className="lt">{item.name}</h1>
        <p className="mhead-sub">{sub}</p>
        <div className="mhead-tags">
          <span className={TAG[item.status]}>{STATUS_TITLE[item.status] + (item.paused ? ", pausiert" : "")}</span>
          {item.guess ? <span className="tagc gray">Zuordnung vermutet</span> : null}
        </div>
      </div>

      <Group footer="Dosierungen ändert nur die behandelnde Klinik.">
        {item.regimens.length ? (
          item.regimens.map((r) => <DoseBlock key={r.id} r={r} today={now.day} named={multi} />)
        ) : (
          <div className="mdose">
            <span className="mdose-k">Dosis für Spotty</span>
            <span className="mdose-v">Nicht im Plan</span>
            {lastLine ? <span className="mdose-s">{lastLine}</span> : null}
          </div>
        )}
      </Group>

      {s ? <SubstanceSections s={s} hasPhoto={hasPhoto} /> : null}

      {item.regimens.map((r) => (
        <div key={r.id} className="mplan">
          {multi ? <SectionHead title={r.name} /> : null}
          <RegimenSections r={r} compact />
        </div>
      ))}

      {item.evidence.length ? <EvidenceGroup list={item.evidence} /> : null}

      {s ? (
        <Group header="Quellen" footer="Allgemeine Arzneimittelkunde. Für Spotty gelten der Plan und die Angaben der Klinik.">
          <ul className="msrc">
            {s.sources.map((src) => (
              <li key={src.url}>
                <a href={src.url} target="_blank" rel="noopener noreferrer">
                  {src.label}
                </a>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      <Group>
        <Row
          glyph="chat"
          color="var(--claude)"
          title="Mit Claude besprechen"
          onClick={() => ask(`Bitte erkläre mir ${item.name}${s ? ` (${s.group})` : ""} im Plan von Spotty: wozu, worauf achten, was bei vergessenen oder erbrochenen Gaben zu tun ist. Dosierungen ändert nur die Klinik.`)}
        />
      </Group>
    </Screen>
  );
}
