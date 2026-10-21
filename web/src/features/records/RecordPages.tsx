// Gesundheitseinträge (Akte) als eigene Seiten: Dokumente, Labor, Erkrankungen, Unverträglichkeiten,
// Fragen an die Klinik, Chronik, Gesundheitsdetails und Kontakte.

import type { CSSProperties } from "react";
import { useDocs, useEntries, useLabs, useProfile } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { useAsk } from "../../lib/ask";
import { openSub } from "../../lib/route";
import { copyText } from "../../lib/files";
import { telHref } from "../../lib/profile";
import { useSheets, useToast } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Icon } from "../../ui/Icon";
import { CircleButton, EmptyCard, Group, NavBar, Row, Screen, SectionHead } from "../../ui/ios";
import { ageAt, fmtDMY } from "@shared/dates.ts";
import { num } from "@shared/entryTypes.ts";
import { fmt } from "../../lib/health/format";
import { DocPage, DocumentsList, UploadSheet } from "./Documents";
import { LabsPanel } from "./Labs";
import { EventSheet, TimelineList } from "./Timeline";
import { QuestionsPanel } from "./Questions";
import { ProfileSheet } from "./ProfileSheet";

export function RecordPage({ sub, back }: { sub: string[]; back: string }) {
  const area = sub[0];
  if (area === "dokumente") return <DocumentsPage back={back} />;
  if (area === "dokument" && sub[1]) return <DocPage docId={sub[1]} back={back.replace(/\/akte$/, "") + "/akte/dokumente"} />;
  if (area === "labor") return <LabsPage back={back} date={sub[1] || null} />;
  if (area === "diagnosen") return <ConditionsPage back={back} />;
  if (area === "diagnose" && sub[1]) return <ConditionPage index={Number(sub[1])} back={back.replace(/\/akte$/, "") + "/akte/diagnosen"} />;
  if (area === "unvertraeglichkeiten") return <AllergiesPage back={back} />;
  if (area === "fragen") return <QuestionsPage back={back} />;
  if (area === "chronik") return <TimelinePage back={back} />;
  if (area === "details") return <DetailsPage back={back} />;
  if (area === "kontakte") return <ContactsPage back={back} />;
  return (
    <Screen>
      <NavBar title="Akte" back={back} />
      <p className="muted-c">Diesen Bereich gibt es nicht.</p>
    </Screen>
  );
}

function DocumentsPage({ back }: { back: string }) {
  const sheets = useSheets();
  return (
    <Screen>
      <NavBar title="Klinische Dokumente" back={back} trailing={<CircleButton icon="plus" label="Dokument hinzufügen" onClick={() => sheets.open((close) => <UploadSheet onClose={close} />)} />} />
      <h1 className="lt">Klinische Dokumente</h1>
      <DocumentsList />
    </Screen>
  );
}

function LabsPage({ back, date }: { back: string; date: string | null }) {
  const labs = useLabs();
  const docs = useDocs();
  return (
    <Screen>
      <NavBar title="Laborergebnisse" back={back} />
      <h1 className="lt">Laborergebnisse</h1>
      <div className="legacy">
        <LabsPanel key={date || "x"} labs={labs} docs={docs} initialDate={date} />
      </div>
    </Screen>
  );
}

function QuestionsPage({ back }: { back: string }) {
  const ask = useAsk();
  return (
    <Screen>
      <NavBar title="Fragen an die Klinik" back={back} />
      <h1 className="lt">Fragen an die Klinik</h1>
      <div className="legacy">
        <QuestionsPanel onAsk={ask} />
      </div>
    </Screen>
  );
}

function TimelinePage({ back }: { back: string }) {
  const sheets = useSheets();
  return (
    <Screen>
      <NavBar title="Chronik" back={back} trailing={<CircleButton icon="plus" label="Ereignis eintragen" onClick={() => sheets.open((close) => <EventSheet event={null} onClose={close} />)} />} />
      <h1 className="lt">Chronik</h1>
      <TimelineList onDoc={(id) => openSub(`akte/dokument/${id}`)} onEdit={(e) => sheets.open((close) => <EventSheet event={e} onClose={close} />)} />
    </Screen>
  );
}

function ConditionsPage({ back }: { back: string }) {
  const profile = useProfile();
  const sheets = useSheets();
  const problems = profile?.data?.problems || [];
  return (
    <Screen>
      <NavBar title="Erkrankungen" back={back} trailing={<CircleButton icon="edit" label="Bearbeiten" onClick={() => sheets.open((close) => <ProfileSheet profile={profile} onClose={close} />)} />} />
      <h1 className="lt">Erkrankungen</h1>
      {problems.length ? (
        <Group footer="Problemliste aus der Akte, wichtigstes zuerst.">
          {problems.map((p, i) => (
            <Row
              key={p.id || i}
              glyph="bandage"
              color="var(--blue)"
              title={`${i + 1}. ${p.title}`}
              sub={[p.status, p.since ? `seit ${/^\d{4}-\d{2}-\d{2}$/.test(p.since) ? fmtDMY(p.since) : p.since}` : ""].filter(Boolean).join(" · ")}
              wrap
              chevron
              onClick={() => openSub(`akte/diagnose/${i}`)}
            />
          ))}
        </Group>
      ) : (
        <EmptyCard title="Keine Erkrankungen eingetragen">Die Problemliste kommt mit dem Import der Akte oder wird mit dem Stift oben rechts gepflegt.</EmptyCard>
      )}
    </Screen>
  );
}

function ConditionPage({ index, back }: { index: number; back: string }) {
  const profile = useProfile();
  const docs = useDocs();
  const ask = useAsk();
  const p = profile?.data?.problems?.[index];
  if (!p) {
    return (
      <Screen>
        <NavBar title="Erkrankung" back={back} />
        <p className="muted-c">Diesen Eintrag gibt es nicht mehr.</p>
      </Screen>
    );
  }
  const sources = (p.sources || []).map((id) => docs.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
  return (
    <Screen>
      <NavBar title={p.title} back={back} />
      <div className="reg-head" style={{ "--cat": "var(--blue)" } as CSSProperties}>
        <span className="reg-ic" aria-hidden="true">
          <Glyph name="bandage" size={40} />
        </span>
        <h1 className="lt center">{p.title}</h1>
        <p className="reg-sub">{[p.status, p.since ? `seit ${/^\d{4}-\d{2}-\d{2}$/.test(p.since) ? fmtDMY(p.since) : p.since}` : ""].filter(Boolean).join(" · ")}</p>
      </div>
      {p.details ? (
        <>
          <SectionHead title="Details" />
          <div className="card about">
            {p.details.split(/\n{2,}/).map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
        </>
      ) : null}
      {sources.length ? (
        <Group header="Quellen">
          {sources.map((d) => (
            <Row key={d.id} glyph="doc" color="var(--blue)" title={d.title} sub={d.doc_date ? fmtDMY(d.doc_date) : undefined} chevron onClick={() => openSub(`akte/dokument/${d.id}`)} />
          ))}
        </Group>
      ) : null}
      <Group>
        <Row glyph="chat" color="var(--claude)" title="Mit Claude besprechen" onClick={() => ask(`Bitte erkläre mir „${p.title}“ bei Spotty: Was bedeutet das, wie ist der Stand laut Akte, und worauf sollten wir achten?`)} />
      </Group>
    </Screen>
  );
}

function AllergiesPage({ back }: { back: string }) {
  const profile = useProfile();
  const sheets = useSheets();
  const list = profile?.data?.allergies || [];
  return (
    <Screen>
      <NavBar title="Unverträglichkeiten" back={back} trailing={<CircleButton icon="edit" label="Bearbeiten" onClick={() => sheets.open((close) => <ProfileSheet profile={profile} onClose={close} />)} />} />
      <h1 className="lt">Unverträglichkeiten</h1>
      {list.length ? (
        list.map((a, i) => (
          <Group key={i} header={`Laut ${a.source}`}>
            {a.items.map((it) => (
              <Row key={it} glyph="shield" color="var(--orange)" title={it} />
            ))}
          </Group>
        ))
      ) : (
        <EmptyCard title="Keine Unverträglichkeiten eingetragen">Sie kommen mit dem Import der Akte oder werden mit dem Stift oben rechts eingetragen.</EmptyCard>
      )}
    </Screen>
  );
}

function DetailsPage({ back }: { back: string }) {
  const profile = useProfile();
  const entries = useEntries();
  const sheets = useSheets();
  const now = useNowValue();
  const ask = useAsk();
  const d = profile?.data;
  if (!d) {
    return (
      <Screen>
        <NavBar title="Gesundheitsdetails" back={back} />
        <h1 className="lt">Gesundheitsdetails</h1>
        <EmptyCard title="Die Akte ist noch leer">Im Profil unter „Akte importieren“ die vorbereitete Datei einlesen. Danach stehen hier Stammdaten, Pflegehinweise und Geräte.</EmptyCard>
      </Screen>
    );
  }
  const age = d.born ? ageAt(d.born, now.day) : null;
  const lastWeight = (() => {
    const fromEntries = entries
      .filter((e) => e.type === "gewicht" && num((e.data as Record<string, unknown>).kg) != null)
      .map((e) => ({ date: e.day, kg: num((e.data as Record<string, unknown>).kg) as number }));
    const all = [...fromEntries, ...(d.weights || []).map((w) => ({ date: w.date, kg: w.kg }))].sort((a, b) => b.date.localeCompare(a.date));
    return all[0] || null;
  })();
  return (
    <Screen>
      <NavBar title="Gesundheitsdetails" back={back} trailing={<CircleButton icon="edit" label="Bearbeiten" onClick={() => sheets.open((close) => <ProfileSheet profile={profile} onClose={close} />)} />} />
      <h1 className="lt">Gesundheitsdetails</h1>
      <Group>
        <Row title="Name" value={d.name || "Spotty"} />
        {d.species || d.breed ? <Row title="Tier" value={[d.species, d.breed].filter(Boolean).join(", ")} /> : null}
        {d.sex ? <Row title="Geschlecht" value={d.sex} /> : null}
        {d.born ? <Row title="Geboren" value={`${fmtDMY(d.born)}${age ? ` · ${age.years} J.` : ""}`} /> : null}
        {d.owner ? <Row title="Halterin" value={d.owner} /> : null}
        {lastWeight ? <Row title="Gewicht" value={`${fmt(lastWeight.kg, 1)} kg`} sub={`am ${fmtDMY(lastWeight.date)}${d.weight_normal ? ` · früher ${d.weight_normal}` : ""}`} /> : null}
      </Group>
      {d.guiding_principle ? (
        <>
          <SectionHead title="Leitlinie der Familie" />
          <div className="card about quote2">
            <p>{d.guiding_principle}</p>
          </div>
        </>
      ) : null}
      {d.family ? (
        <Group header="Familie und Aufgaben">
          <Row title={d.family} wrap />
        </Group>
      ) : null}
      {d.care_notes?.length ? (
        <Group header="Pflegehinweise">
          {d.care_notes.map((c, i) => (
            <Row key={i} title={c} wrap />
          ))}
        </Group>
      ) : null}
      {d.devices?.length ? (
        <Group header="Geräte und Hilfsmittel">
          {d.devices.map((x, i) => (
            <Row key={i} title={x.name} sub={x.note || undefined} wrap />
          ))}
        </Group>
      ) : null}
      {d.history?.length ? (
        <Group header="Vorgeschichte">
          {d.history.map((h, i) => (
            <Row key={i} title={h.text} sub={/^\d{4}-\d{2}-\d{2}$/.test(h.date) ? fmtDMY(h.date) : h.date} wrap />
          ))}
        </Group>
      ) : null}
      {d.residences?.length ? (
        <Group header="Wohnorte">
          {d.residences.map((r, i) => (
            <Row key={i} title={r.place} sub={`${r.from}${r.to ? `–${r.to}` : " bis heute"}${r.note ? ` · ${r.note}` : ""}`} wrap />
          ))}
        </Group>
      ) : null}
      {d.notes ? (
        <Group header="Notizen">
          <Row title={d.notes} wrap />
        </Group>
      ) : null}
      <Group>
        <Row title="Kontakte" chevron onClick={() => openSub("akte/kontakte")} />
        <Row title="Erkrankungen" chevron onClick={() => openSub("akte/diagnosen")} />
        <Row title="Unverträglichkeiten" chevron onClick={() => openSub("akte/unvertraeglichkeiten")} />
      </Group>
      <Group>
        <Row glyph="chat" color="var(--claude)" title="Zusammenfassung für den Notdienst" onClick={() => ask("Bitte fasse Spottys Akte für jemanden zusammen, der ihn nicht kennt (z. B. eine neue Tierärztin im Notdienst): Vorgeschichte, aktuelle Diagnosen und Verdachtsdiagnosen, laufende Behandlung, Unverträglichkeiten und worauf man achten muss.")} />
      </Group>
    </Screen>
  );
}

function ContactsPage({ back }: { back: string }) {
  const profile = useProfile();
  const sheets = useSheets();
  const toast = useToast();
  const contacts = profile?.data?.contacts || [];
  const copy = async (n: string) => {
    const ok = await copyText(n);
    toast.show(ok ? "Nummer kopiert" : "Kopieren nicht möglich", { error: !ok });
  };
  return (
    <Screen>
      <NavBar title="Kontakte" back={back} trailing={<CircleButton icon="edit" label="Bearbeiten" onClick={() => sheets.open((close) => <ProfileSheet profile={profile} onClose={close} />)} />} />
      <h1 className="lt">Kontakte</h1>
      {contacts.length ? (
        contacts.map((c, i) => (
          <Group key={i} footer={[c.address, c.note].filter(Boolean).join(" · ") || undefined}>
            <Row glyph="person" color="var(--blue)" title={c.name} sub={c.role || undefined} wrap />
            {c.phone ? <PhoneRow label="Telefon" number={c.phone} onCopy={copy} /> : null}
            {c.emergency ? <PhoneRow label="Notdienst" number={c.emergency} onCopy={copy} red /> : null}
          </Group>
        ))
      ) : (
        <EmptyCard title="Keine Kontakte">Mit dem Stift oben rechts die Klinik, den Notdienst und weitere Ansprechpartner eintragen.</EmptyCard>
      )}
    </Screen>
  );
}

/** Nummer wie in Kontakte: Bezeichnung klein darüber, Nummer zum Antippen, daneben Kopieren. */
function PhoneRow({ label, number, red, onCopy }: { label: string; number: string; red?: boolean; onCopy: (n: string) => void }) {
  return (
    <div className="lrow tel-row">
      <a className="row-t tel-link" href={telHref(number)} aria-label={`${label} ${number} anrufen`}>
        <span className="row-sub">{label}</span>
        <span className={`row-title tel${red ? " red" : ""}`}>{number}</span>
      </a>
      <button type="button" className="cb sm" onClick={() => onCopy(number)} aria-label={`${label} kopieren`} title="Kopieren">
        <Icon name="copy" size={17} stroke={2.2} />
      </button>
    </div>
  );
}
