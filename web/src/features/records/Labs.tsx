// Laborwerte: je Untersuchungstag nach Gruppen, mit Referenzbalken wie auf dem Geräteausdruck und Verlauf je Parameter.

import { useMemo, useState } from "react";
import type { Doc, Lab } from "@shared/types.ts";
import { fmtDM, fmtDMY } from "@shared/dates.ts";
import { Seg, Toggle } from "../../ui/controls";
import { Sparkline } from "../../ui/Chart";
import { Sheet, useSheets } from "../../ui/overlays";
import { Empty } from "../common";

const GROUP_ORDER = ["Hämatologie", "Klinische Chemie", "Hormone", "Sonstiges"];
const CODE_ORDER = ["HCT", "HGB", "RBC", "MCV", "MCH", "MCHC", "RDW", "RETIC", "RETICP", "RETHGB", "WBC", "NEU", "NEUP", "LYM", "LYMP", "MONO", "MONOP", "EOS", "EOSP", "BASO", "BASOP", "PLT", "MPV", "PDW", "PCT", "UREA", "CREA", "SDMA", "PHOS", "NA", "K", "NAK", "CL", "CA", "TBIL", "ALT", "ALKP", "GLU", "CHOL", "TP", "ALB", "GLOB", "ALBGLOB", "T4", "TSH"];

export function fmtLab(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

export function labValue(l: Lab): string {
  return l.value_text || fmtLab(l.value);
}

export function isOut(l: Lab): boolean {
  if (l.flag) return true;
  if (l.value == null) return false;
  return (l.ref_low != null && l.value < l.ref_low) || (l.ref_high != null && l.value > l.ref_high);
}

function refText(l: Lab): string {
  if (l.ref_low != null && l.ref_high != null) return `${fmtLab(l.ref_low)}–${fmtLab(l.ref_high)}`;
  if (l.ref_high != null) return `bis ${fmtLab(l.ref_high)}`;
  if (l.ref_low != null) return `ab ${fmtLab(l.ref_low)}`;
  return "";
}

export function RefBar({ lab }: { lab: Lab }) {
  const { value, ref_low: lo, ref_high: hi } = lab;
  if (lo == null && hi == null) return <span />;
  let dmin: number;
  let dmax: number;
  if (lo != null && hi != null) {
    const span = hi - lo || Math.abs(hi) || 1;
    dmin = lo - span * 0.5;
    dmax = hi + span * 0.5;
  } else if (hi != null) {
    dmin = 0;
    dmax = hi * 1.5 || 1;
  } else {
    dmin = 0;
    dmax = (lo as number) * 2 || 1;
  }
  const pos = (v: number) => Math.min(99, Math.max(1, ((v - dmin) / (dmax - dmin)) * 100));
  const refL = lo != null ? pos(lo) : 0;
  const refR = hi != null ? pos(hi) : 100;
  let markV = value;
  if (markV == null && lab.value_text) {
    const m = /([<>])\s*([\d.,]+)/.exec(lab.value_text);
    if (m) markV = Number(m[2].replace(",", ".")) * (m[1] === "<" ? 0.9 : 1.1);
  }
  return (
    <div className="refbar" aria-hidden="true">
      <div className="track" />
      <div className="ref" style={{ left: `${refL}%`, width: `${Math.max(2, refR - refL)}%` }} />
      {markV != null ? <div className={`mark${isOut(lab) ? " out" : ""}`} style={{ left: `${pos(markV)}%` }} /> : null}
    </div>
  );
}

function sortLabs(a: Lab, b: Lab): number {
  const ia = CODE_ORDER.indexOf(a.code || "");
  const ib = CODE_ORDER.indexOf(b.code || "");
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.param.localeCompare(b.param, "de");
}

const seriesKey = (l: Lab) => `${l.code || l.param}|${l.unit || ""}`;

export function LabsPanel({ labs, docs, initialDate }: { labs: Lab[]; docs: Doc[]; initialDate?: string | null }) {
  const sheets = useSheets();
  const dates = useMemo(() => [...new Set(labs.map((l) => l.date))].sort().reverse(), [labs]);
  const [date, setDate] = useState<string>(initialDate && dates.includes(initialDate) ? initialDate : dates[0] || "");
  const [onlyOut, setOnlyOut] = useState(false);
  const series = useMemo(() => {
    const m = new Map<string, Lab[]>();
    for (const l of labs) {
      const k = seriesKey(l);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    for (const list of m.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return m;
  }, [labs]);

  if (!labs.length) {
    return (
      <div className="card">
        <Empty title="Noch keine Laborwerte">
          <p>Laborwerte kommen mit dem Import der Akte oder wenn Claude einen Laborbefund ausliest (Dokumente → Dokument hinzufügen).</p>
        </Empty>
      </div>
    );
  }

  const day = labs.filter((l) => l.date === date && (!onlyOut || isOut(l)));
  const groups = new Map<string, Lab[]>();
  for (const l of day) {
    const g = l.grp || "Sonstiges";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(l);
  }
  const groupNames = [...groups.keys()].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "de");
  });
  const outCount = labs.filter((l) => l.date === date && isOut(l)).length;
  const docOf = (id: string | null) => docs.find((d) => d.id === id) || null;
  const sources = [...new Set(labs.filter((l) => l.date === date).map((l) => l.document_id))].map(docOf).filter(Boolean) as Doc[];
  const devices = [...new Set(labs.filter((l) => l.date === date && l.device).map((l) => l.device))];

  return (
    <div className="stack">
      <Seg<string> label="Untersuchungstag" value={date} onChange={setDate} options={dates.map((d) => [d, d.slice(0, 4) === dates[0].slice(0, 4) ? fmtDM(d) : `${fmtDM(d)}${d.slice(2, 4)}`] as [string, string])} />
      <div className="card stack-s">
        <div className="row between">
          <b>
            {fmtDMY(date)} · {labs.filter((l) => l.date === date).length} Werte
          </b>
          <span className={outCount ? "tag warn" : "tag ok"}>{outCount ? `${outCount} außerhalb der Referenz` : "alle im Referenzbereich"}</span>
        </div>
        {sources.length ? <p className="hint">Quelle: {sources.map((d) => d.title).join(" · ")}</p> : null}
        {devices.length ? <p className="hint">Gerät: {devices.join(", ")}</p> : null}
        <Toggle label="Nur auffällige Werte" checked={onlyOut} onChange={setOnlyOut} />
      </div>
      {groupNames.map((g) => (
        <div key={g} className="stack-s">
          <div className="section-title">
            <h2>{g}</h2>
          </div>
          <div className="card flush">
            {groups
              .get(g)!
              .sort(sortLabs)
              .map((l) => {
                const s = series.get(seriesKey(l)) || [];
                const vals = s.filter((x) => x.value != null).map((x) => x.value as number);
                return (
                  <button key={l.id} className="lab" onClick={() => sheets.open((close) => <LabSheet lab={l} all={labs} docs={docs} onClose={close} />)}>
                    <span className="p">
                      {l.param}
                      <span>
                        {[l.unit, refText(l) ? `Ref. ${refText(l)}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={`v${l.flag ? ` ${l.flag}` : isOut(l) ? " H" : ""}`}>
                      {labValue(l)}
                      {l.flag ? ` ${l.flag}` : ""}
                    </span>
                    <span className="stack-s" style={{ gap: 4 }}>
                      <RefBar lab={l} />
                      {vals.length > 1 ? <Sparkline values={vals} width={90} height={20} refLow={l.ref_low} refHigh={l.ref_high} /> : null}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      {!day.length ? <p className="hint">Keine auffälligen Werte an diesem Tag.</p> : null}
      <p className="hint">Referenzbereiche gelten für das jeweilige Labor und Gerät. Werte verschiedener Labore sind nur eingeschränkt vergleichbar.</p>
    </div>
  );
}

function LabSheet({ lab, all, docs, onClose }: { lab: Lab; all: Lab[]; docs: Doc[]; onClose: () => void }) {
  const same = all.filter((l) => (lab.code ? l.code === lab.code : l.param === lab.param)).sort((a, b) => b.date.localeCompare(a.date));
  const sameUnit = same.filter((l) => (l.unit || "") === (lab.unit || "") && l.value != null).sort((a, b) => a.date.localeCompare(b.date));
  const docTitle = (id: string | null) => docs.find((d) => d.id === id)?.title || "";
  return (
    <Sheet title={lab.param} onClose={onClose}>
      {sameUnit.length > 1 ? (
        <div className="card">
          <div className="card-title">Verlauf ({lab.unit})</div>
          <Sparkline values={sameUnit.map((l) => l.value as number)} width={300} height={70} refLow={lab.ref_low} refHigh={lab.ref_high} />
          <p className="hint">
            {sameUnit.map((l) => `${fmtDMY(l.date)}: ${labValue(l)}`).join(" · ")}
          </p>
        </div>
      ) : null}
      <div className="card flush">
        {same.map((l) => (
          <div key={l.id} className="lab" style={{ cursor: "default" }}>
            <span className="p">
              {fmtDMY(l.date)}
              <span>{[docTitle(l.document_id), l.device].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={`v${l.flag ? ` ${l.flag}` : isOut(l) ? " H" : ""}`}>
              {labValue(l)} {l.unit || ""}
              {l.flag ? ` ${l.flag}` : ""}
            </span>
            <span className="stack-s" style={{ gap: 2 }}>
              <RefBar lab={l} />
              <span className="hint">{refText(l) ? `Ref. ${refText(l)}` : "ohne Referenz"}</span>
            </span>
          </div>
        ))}
      </div>
      {same.some((l) => l.note) ? (
        <div className="stack-s">
          {same
            .filter((l) => l.note)
            .map((l) => (
              <p key={l.id} className="hint">
                {fmtDMY(l.date)}: {l.note}
              </p>
            ))}
        </div>
      ) : null}
    </Sheet>
  );
}
