// Akte: Übersicht (Stammdaten, Problemliste, Kontakte), Dokumente, Labor, Chronik, Fragen an die Klinik.

import { useEffect, useState } from "react";
import { useDocs, useEntries, useLabs, useProfile } from "../../lib/data";
import { Seg } from "../../ui/controls";
import { useSheets, useToast } from "../../ui/overlays";
import { Icon } from "../../ui/Icon";
import { Empty } from "../common";
import { DocSheet, DocumentsPanel } from "./Documents";
import { LabsPanel } from "./Labs";
import { TimelinePanel } from "./Timeline";
import { QuestionsPanel } from "./Questions";
import { ProfileSheet } from "./ProfileSheet";
import { ageAt, fmtDMY, type BerlinNow } from "@shared/dates.ts";
import type { ProfileData } from "@shared/types.ts";
import { fmtNum, num } from "@shared/entryTypes.ts";
import { copyText } from "../../lib/files";
import { telHref } from "../../lib/profile";

type ProblemT = NonNullable<ProfileData["problems"]>[number];

function ProblemItem({ n, problem: p, docTitle, onDoc }: { n: number; problem: ProblemT; docTitle: (id: string) => string | undefined; onDoc: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const sources = (p.sources || []).filter((s) => docTitle(s));
  const since = p.since ? `seit ${/^\d{4}-\d{2}-\d{2}$/.test(p.since) ? fmtDMY(p.since) : p.since}` : "";
  return (
    <div className="problem" style={{ display: "block" }}>
      <button className="problem-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="n">{n}</span>
        <span>
          <b>{p.title}</b>
          {p.status || since ? (
            <span className="st" style={{ display: "block" }}>
              {[p.status, since].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="chev">
          <Icon name="right" size={18} />
        </span>
      </button>
      {open ? (
        <div className="problem-body">
          {p.details ? <p>{p.details}</p> : null}
          {sources.map((s) => (
            <button key={s} className="src-link" onClick={() => onDoc(s)}>
              <Icon name="file" size={16} />
              {docTitle(s)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type RecordsTab = "uebersicht" | "dokumente" | "labor" | "chronik" | "fragen";

export function RecordsView({ now, onAsk, tab: initialTab }: { now: BerlinNow; onAsk: (p: string) => void; tab?: RecordsTab }) {
  const [tab, setTab] = useState<RecordsTab>(initialTab || "uebersicht");
  const [labDate, setLabDate] = useState<string | null>(null);
  const sheets = useSheets();
  const labs = useLabs();
  const docs = useDocs();
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const openDoc = (id: string) => sheets.open((close) => <DocSheet docId={id} onClose={close} onAsk={onAsk} onLabs={(d) => { setLabDate(d); setTab("labor"); }} />);
  return (
    <div className="stack">
      <Seg<RecordsTab>
        label="Bereich der Akte"
        value={tab}
        onChange={setTab}
        options={[
          ["uebersicht", "Übersicht"],
          ["dokumente", "Dokumente"],
          ["labor", "Labor"],
          ["chronik", "Chronik"],
          ["fragen", "Fragen"],
        ]}
      />
      {tab === "uebersicht" ? <Overview now={now} onAsk={onAsk} onDoc={openDoc} /> : null}
      {tab === "dokumente" ? <DocumentsPanel onAsk={onAsk} onLabs={(d) => { setLabDate(d); setTab("labor"); }} /> : null}
      {tab === "labor" ? <LabsPanel key={labDate || "x"} labs={labs} docs={docs} initialDate={labDate} /> : null}
      {tab === "chronik" ? <TimelinePanel onDoc={openDoc} /> : null}
      {tab === "fragen" ? <QuestionsPanel onAsk={onAsk} /> : null}
    </div>
  );
}

function Overview({ now, onAsk, onDoc }: { now: BerlinNow; onAsk: (p: string) => void; onDoc: (id: string) => void }) {
  const profile = useProfile();
  const docs = useDocs();
  const entries = useEntries();
  const sheets = useSheets();
  const toast = useToast();
  const d = profile?.data;
  if (!d) {
    return (
      <div className="card">
        <Empty title="Die Akte ist noch leer">
          <p>Unter Einstellungen → Akte importieren die vorbereitete Datei einlesen. Danach stehen hier Stammdaten, Problemliste, Kontakte und alle Befunde.</p>
        </Empty>
      </div>
    );
  }
  const age = d.born ? ageAt(d.born, now.day) : null;
  const lastWeight = (() => {
    const fromEntries = entries
      .filter((e) => e.type === "gewicht" && num((e.data as Record<string, unknown>).kg) != null)
      .map((e) => ({ date: e.day, kg: num((e.data as Record<string, unknown>).kg) as number, source: "Protokoll" }));
    const all = [...fromEntries, ...(d.weights || []).map((w) => ({ date: w.date, kg: w.kg, source: w.source || "" }))].sort((a, b) => b.date.localeCompare(a.date));
    return all[0] || null;
  })();
  const docTitle = (id: string) => docs.find((x) => x.id === id)?.title;

  return (
    <div className="stack">
      <div className="cols">
        <div className="col">
          <div className="card stack-s">
            <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 24 }}>{d.name || "Spotty"}</h2>
                <p className="muted">{[d.species, d.breed, d.sex].filter(Boolean).join(" · ")}</p>
              </div>
              <button className="icon-btn" onClick={() => sheets.open((close) => <ProfileSheet profile={profile} onClose={close} />)} aria-label="Akte bearbeiten">
                <Icon name="edit" />
              </button>
            </div>
            <dl className="kv">
              {d.born ? (
                <>
                  <dt>Geboren</dt>
                  <dd>
                    {fmtDMY(d.born)}
                    {age ? ` · ${age.years} Jahre${age.months ? `, ${age.months} Monate` : ""}` : ""}
                  </dd>
                </>
              ) : null}
              {d.owner ? (
                <>
                  <dt>Halterin</dt>
                  <dd>{d.owner}</dd>
                </>
              ) : null}
              {lastWeight ? (
                <>
                  <dt>Gewicht</dt>
                  <dd>
                    {fmtNum(lastWeight.kg, 1)} kg am {fmtDMY(lastWeight.date)}
                    {d.weight_normal ? <span className="muted"> · früher {d.weight_normal}</span> : null}
                  </dd>
                </>
              ) : null}
            </dl>
            {d.guiding_principle ? (
              <div className="finding" style={{ borderLeftColor: "var(--accent)", marginTop: 4 }}>
                <b>Leitlinie der Familie</b>
                <p>{d.guiding_principle}</p>
              </div>
            ) : null}
          </div>

          {d.problems?.length ? (
            <>
              <div className="section-title">
                <h2>Problemliste</h2>
              </div>
              <div className="card" style={{ paddingBlock: 4 }}>
                {d.problems.map((p, i) => (
                  <ProblemItem key={p.id || i} n={i + 1} problem={p} docTitle={docTitle} onDoc={onDoc} />
                ))}
              </div>
            </>
          ) : null}

          {d.history?.length ? (
            <>
              <div className="section-title">
                <h2>Vorgeschichte</h2>
              </div>
              <div className="card stack-s">
                {d.history.map((h, i) => (
                  <p key={i}>
                    <b className="num">{/^\d{4}-\d{2}-\d{2}$/.test(h.date) ? fmtDMY(h.date) : h.date}</b> {h.text}
                  </p>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <div className="col">
          {d.contacts?.length ? (
            <>
              <div className="section-title">
                <h2>Kontakte</h2>
              </div>
              <div className="card flush">
                {d.contacts.map((c, i) => (
                  <div key={i} className="erow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                    <div>
                      <div className="s">{c.name}</div>
                      {c.role ? <div className="x">{c.role}</div> : null}
                      {c.address ? <div className="x">{c.address}</div> : null}
                      {c.note ? <div className="x">{c.note}</div> : null}
                      {c.phone ? (
                        <div className="x num" style={{ color: "var(--ink)", fontSize: 15, marginTop: 4 }}>
                          {c.phone}
                        </div>
                      ) : null}
                    </div>
                    {c.phone ? (
                      <div className="stack-s" style={{ gap: 6 }}>
                        <a className="btn small primary" href={telHref(c.phone)}>
                          <Icon name="phone" size={18} /> Anrufen
                        </a>
                        <button
                          className="btn small ghost"
                          onClick={async () => {
                            const ok = await copyText(c.phone || "");
                            toast.show(ok ? "Nummer kopiert" : "Kopieren nicht möglich", { error: !ok });
                          }}
                        >
                          <Icon name="copy" size={18} /> Kopieren
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {d.allergies?.length ? (
            <>
              <div className="section-title">
                <h2>Unverträglichkeiten</h2>
              </div>
              <div className="card stack-s">
                {d.allergies.map((a, i) => (
                  <div key={i}>
                    <p>{a.items.join(", ")}</p>
                    <p className="hint">{a.source}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {d.care_notes?.length ? (
            <>
              <div className="section-title">
                <h2>Pflegehinweise</h2>
              </div>
              <div className="card">
                <ul style={{ margin: 0, paddingLeft: 20 }} className="stack-s">
                  {d.care_notes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}

          {d.devices?.length ? (
            <>
              <div className="section-title">
                <h2>Geräte und Hilfsmittel</h2>
              </div>
              <div className="card flush">
                {d.devices.map((x, i) => (
                  <div key={i} className="erow" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                    <div>
                      <div className="s">{x.name}</div>
                      {x.note ? <div className="x">{x.note}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {d.residences?.length ? (
            <>
              <div className="section-title">
                <h2>Wohnorte</h2>
              </div>
              <div className="card stack-s">
                {d.residences.map((r, i) => (
                  <p key={i} className="small">
                    <b className="num">
                      {r.from}
                      {r.to ? `–${r.to}` : " bis heute"}
                    </b>{" "}
                    {r.place}
                    {r.note ? <span className="muted"> · {r.note}</span> : null}
                  </p>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {d.notes ? <p className="hint" style={{ whiteSpace: "pre-wrap" }}>{d.notes}</p> : null}

      <button className="btn claude" onClick={() => onAsk("Bitte fasse Spottys Akte für jemanden zusammen, der ihn nicht kennt (z. B. eine neue Tierärztin im Notdienst): Vorgeschichte, aktuelle Diagnosen und Verdachtsdiagnosen, laufende Behandlung, Unverträglichkeiten und worauf man achten muss.")}>
        <Icon name="claude" size={20} /> Zusammenfassung für den Notdienst
      </button>
    </div>
  );
}
