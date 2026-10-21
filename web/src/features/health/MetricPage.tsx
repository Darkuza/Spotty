// Messwertseite wie in Health: Zeitraum T · W · M · 6 M. · J, Kopfzahl, Diagramm mit Auswahl und Wischen,
// Trend, Highlights, Erklärung, Optionen (Anpinnen, Schnell eintragen) und die Wege zu allen Daten.

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useEvents, useRegimens, saveDayNote, useDayNotes } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { useAsk } from "../../lib/ask";
import { openSub } from "../../lib/route";
import { useNameOf } from "../../lib/session";
import { Sheet, useSheets, useToast } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Icon } from "../../ui/Icon";
import { CircleButton, Group, NavBar, Row, Screen, SectionHead, Segmented } from "../../ui/ios";
import { LAGE_KURZ, TYPES, summarize } from "@shared/entryTypes.ts";
import { median } from "@shared/stats.ts";
import { therapyStart } from "@shared/plan.ts";
import { isValidDay } from "@shared/dates.ts";
import type { EntryType } from "@shared/types.ts";
import { NIGHT_STATES, catColor, catOf, metricOf, unitFor, type MetricDef } from "../../lib/health/metrics";
import { colValues, periodOf, scaleFor, summaryOf, type RangeKey } from "../../lib/health/series";
import { TREND_METRICS, highlightsOf, trendOf } from "../../lib/health/highlights";
import { fmt, fmtDate, fmtDateWd, plural } from "../../lib/health/format";
import { uploadProtocolPhoto } from "../../lib/photos";
import { EntrySheet } from "../entry/EntrySheet";
import { DetailChart, type Marker } from "./charts";
import { HighlightCard } from "./cards";
import { togglePinned, toggleQuick, usePinned, useQuick, useSeries, useSources } from "./useHealth";

const RANGES: [RangeKey, string][] = [
  ["T", "T"],
  ["W", "W"],
  ["M", "M"],
  ["6M", "6 M."],
  ["J", "J"],
];

function useMarkers(): Marker[] {
  const regimens = useRegimens();
  const events = useEvents();
  return useMemo(() => {
    const out: Marker[] = [];
    const start = therapyStart(regimens);
    if (start) out.push({ day: start, label: "Therapiebeginn", prio: 0 });
    for (const r of regimens) {
      if (!r.active || r.category !== "med") continue;
      const steps = [...(r.steps || [])].sort((a, b) => a.from.localeCompare(b.from));
      const short = r.name.split(" ")[0];
      for (let i = 1; i < steps.length; i++) if (steps[i].dose && steps[i].dose !== steps[i - 1].dose) out.push({ day: steps[i].from, label: `${short} ${steps[i].dose}`, prio: 1 });
    }
    for (const e of events) if (e.category === "klinik") out.push({ day: e.date, label: "Klinik", prio: 2 });
    return out;
  }, [regimens, events]);
}

/** „+“ einer Messwertseite: passende Eingabe öffnen. */
export function useAddFor(def: MetricDef | undefined) {
  const sheets = useSheets();
  const toast = useToast();
  const now = useNowValue();
  const fileRef = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={async (e) => {
        const files = e.target.files;
        if (!files?.length) return;
        try {
          for (const f of Array.from(files)) await uploadProtocolPhoto(f, now.day);
          toast.show(files.length > 1 ? `${files.length} Fotos gespeichert` : "Foto gespeichert");
        } catch (err) {
          toast.show(err instanceof Error ? err.message : "Foto konnte nicht hochgeladen werden.", { error: true });
        } finally {
          if (fileRef.current) fileRef.current.value = "";
        }
      }}
    />
  );
  const add = () => {
    if (!def?.entry) return;
    const e = def.entry;
    if ("special" in e) {
      if (e.special === "foto") fileRef.current?.click();
      else sheets.open((close) => <NightSheet onClose={close} />);
      return;
    }
    const preset = e.tag ? { tags: [e.tag] } : undefined;
    sheets.open((close) => <EntrySheet type={e.type as EntryType} day={now.day} preset={preset} startCounter={e.type === "atem"} onClose={close} />);
  };
  return { add, input };
}

export function MetricPage({ id, back }: { id: string; back: string }) {
  const def = metricOf(id);
  const src = useSources();
  const now = useNowValue();
  const s = useSeries(def, src);
  const [range, setRange] = useState<RangeKey>("W");
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const markers = useMarkers();
  const { add, input } = useAddFor(def);
  const period = useMemo(() => periodOf(range, offset, now.day), [range, offset, now.day]);
  const cols = useMemo(() => (def && s ? colValues(def, period, s.samples, s.days) : []), [def, period, s]);
  if (!def || !s) {
    return (
      <Screen>
        <NavBar title="Messwert" back={back} />
        <p className="muted-c">Diesen Messwert gibt es nicht.</p>
      </Screen>
    );
  }
  const scale = scaleFor(def, cols);
  const summary = summaryOf(def, period, cols, s.samples, s.days, now.day, sel);
  const setR = (r: RangeKey) => {
    setRange(r);
    setOffset(0);
    setSel(null);
  };
  const shift = (dir: -1 | 1) => {
    if (dir === 1 && offset >= 0) return;
    setOffset((o) => o + dir);
    setSel(null);
  };
  const color = catColor(def.cat);
  return (
    <Screen className="metric-page">
      {input}
      <NavBar title={def.label} back={back} trailing={def.entry ? <CircleButton icon="plus" label={`${def.label} eintragen`} onClick={add} /> : null} />
      <div className="dtop" style={{ "--cat": color } as CSSProperties}>
        <Segmented<RangeKey> label="Zeitraum" value={range} onChange={setR} options={RANGES} />
        <div className="dsum" aria-live="polite">
          {summary.label ? <p className="dsum-l">{summary.label}</p> : null}
          <p className={`dsum-v${summary.empty ? " empty" : ""}`}>
            {summary.value}
            {summary.unit ? <small>{summary.unit === def.unit ? unitFor(def, summary.value) : summary.unit}</small> : null}
          </p>
          <div className="dsum-w">
            <span>{summary.when}</span>
            <span className="dsum-nav">
              <button type="button" onClick={() => shift(-1)} aria-label="Früherer Zeitraum">
                <Icon name="left" size={16} stroke={2.6} />
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Späterer Zeitraum" disabled={offset >= 0}>
                <Icon name="right" size={16} stroke={2.6} />
              </button>
            </span>
          </div>
          {summary.sub ? <p className="dsum-s">{summary.sub}</p> : null}
        </div>
        <DetailChart def={def} range={range} cols={cols} scale={scale} selected={sel} onSelect={setSel} onSwipe={shift} markers={range === "W" ? markers : range === "M" ? markers.filter((m) => (m.prio ?? 5) <= 1) : []} ariaLabel={`${def.label}, ${summary.when}: ${summary.label} ${summary.value} ${summary.unit}`} />
        {def.ref && (range === "W" || range === "M" || range === "T") ? (
          <p className="dref">
            <i aria-hidden="true" />
            {def.id === "atem" ? "Linie bei 40: ab hier gilt die Ruheatmung als Warnzeichen" : def.id === "spo2" ? "Linie bei 95 %: darunter wiederholen und bei Bedarf anrufen" : `Linie bei ${def.ref.label}`}
          </p>
        ) : null}
        <TrendRow def={def} />
      </div>
      <div className="dlow">
        <MetricExtras def={def} period={{ from: period.from, to: period.to }} />
        <MetricHighlights def={def} />
        <section className="dsec" aria-label={`Über ${def.label}`}>
          <SectionHead title={`Über ${def.label}`} />
          <div className="card about">
            <p>{def.about}</p>
          </div>
        </section>
        <MetricOptions def={def} />
      </div>
    </Screen>
  );
}

function TrendRow({ def }: { def: MetricDef }) {
  const src = useSources();
  const now = useNowValue();
  const t = useMemo(() => (TREND_METRICS.includes(def.id) ? trendOf(def.id, src, now.day) : ("zu wenig" as const)), [def.id, src, now.day]);
  const text = t === "zu wenig" || t === null ? (t === null ? "Gleichbleibend" : "Nicht verfügbar") : t.dir === "up" ? "Steigend" : "Sinkend";
  return (
    <button type="button" className="trendrow" onClick={() => openSub("trends")}>
      <span>Trend</span>
      <b>
        {t && t !== "zu wenig" ? <Icon name={t.dir === "up" ? "up" : "down"} size={16} stroke={2.6} /> : null}
        {text}
      </b>
    </button>
  );
}

function MetricHighlights({ def }: { def: MetricDef }) {
  const src = useSources();
  const now = useNowValue();
  const list = useMemo(() => highlightsOf(src, now, def.id), [src, now, def.id]);
  if (!list.length) return null;
  return (
    <section className="dsec" aria-label="Highlights">
      <SectionHead title="Highlights" action={{ label: "Alle anzeigen", onClick: () => openSub("highlights") }} />
      <div className="mcards">
        {list.map((h) => (
          <HighlightCard key={h.id} hl={h} />
        ))}
      </div>
    </section>
  );
}

/** Zusätze je Messwert: Atemzüge nach Liegeseite und der Wert vor Therapiebeginn. */
function MetricExtras({ def, period }: { def: MetricDef; period: { from: string; to: string } }) {
  const src = useSources();
  const regimens = useRegimens();
  const s = useSeries(def, src);
  if (def.id !== "atem" || !s) return null;
  const inP = s.samples.filter((x) => x.day >= period.from && x.day <= period.to && !x.hollow);
  const groups = new Map<string, number[]>();
  for (const x of inP) {
    const lage = typeof x.entry?.data?.lage === "string" ? (x.entry.data.lage as string) : "";
    if (!groups.has(lage)) groups.set(lage, []);
    groups.get(lage)!.push(x.v);
  }
  const order = ["links", "rechts", "brust", "ruecken", "sitzt", ""];
  const sides = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const start = therapyStart(regimens);
  const before = start ? s.samples.filter((x) => x.day < start && !x.hollow).map((x) => x.v) : [];
  const zust = new Map<string, number[]>();
  for (const x of inP) {
    const z = x.s || "";
    if (!zust.has(z)) zust.set(z, []);
    zust.get(z)!.push(x.v);
  }
  if (!sides.length && !before.length) return null;
  return (
    <section className="dsec" aria-label="Nach Liegeseite">
      <SectionHead title="Im gewählten Zeitraum" />
      {sides.length ? (
        <Group header="Nach Liegeseite" footer="Nur Zählungen in Ruhe. Bei wenigen Werten sind Unterschiede zwischen den Seiten oft Zufall.">
          {sides.map(([k, v]) => (
            <Row key={k || "none"} title={k ? LAGE_KURZ[k] || k : "ohne Angabe"} sub={`${fmt(Math.min(...v))}–${fmt(Math.max(...v))} · ${plural(v.length, "Zählung", "Zählungen")}`} value={`Median ${fmt(median(v))}`} />
          ))}
        </Group>
      ) : null}
      {zust.size > 1 ? (
        <Group header="Nach Zustand">
          {[...zust.entries()].map(([k, v]) => (
            <Row key={k || "none"} title={k === "schlaeft" ? "im Schlaf" : k === "ruhig" ? "wach, ruhig" : k ? k : "ohne Angabe"} sub={plural(v.length, "Zählung", "Zählungen")} value={`Median ${fmt(median(v))}`} />
          ))}
        </Group>
      ) : null}
      {before.length && start ? (
        <Group footer={`Vor dem ${fmtDate(start)}, aus dem Protokoll.`}>
          <Row title="Vor Therapiebeginn" sub={`${fmt(Math.min(...before))}–${fmt(Math.max(...before))} · ${plural(before.length, "Zählung", "Zählungen")}`} value={`Median ${fmt(median(before))}`} />
        </Group>
      ) : null}
    </section>
  );
}

function MetricOptions({ def }: { def: MetricDef }) {
  const [pinned] = usePinned();
  const [quick] = useQuick();
  const ask = useAsk();
  const entryType = def.entry && "type" in def.entry && !def.entry.tag && !def.entry.field ? (def.entry.type as EntryType) : null;
  const isPinned = pinned.includes(def.id);
  const isQuick = entryType ? quick.includes(entryType) : false;
  const cat = catOf(def.cat);
  return (
    <>
      <section className="dsec" aria-label="Optionen">
        <SectionHead title="Optionen" />
        <Group footer={entryType ? "Beides erscheint in der Übersicht und gilt nur für dieses Gerät." : "Angepinnte Themen erscheinen in der Übersicht. Gilt für dieses Gerät."}>
          {entryType ? (
            <Row
              title="Zu „Schnell eintragen“ hinzufügen"
              wrap
              onClick={() => toggleQuick(entryType)}
              accessory={
                <span className={`pinb${isQuick ? " on" : ""}`} aria-hidden="true">
                  <Glyph name="plus" size={26} />
                </span>
              }
              ariaLabel={isQuick ? "Aus „Schnell eintragen“ entfernen" : "Zu „Schnell eintragen“ hinzufügen"}
            />
          ) : null}
          <Row
            title="Zu „Angepinnt“ hinzufügen"
            onClick={() => togglePinned(def.id)}
            accessory={
              <span className={`pinb${isPinned ? " on" : ""}`} aria-hidden="true">
                <Glyph name="pin" size={26} />
              </span>
            }
            ariaLabel={isPinned ? "Nicht mehr anpinnen" : "Anpinnen"}
          />
        </Group>
      </section>
      <Group>
        <Row title="Alle Daten anzeigen" chevron onClick={() => openSub(`m/${def.id}/daten`)} />
        <Row title="Wer hat eingetragen" chevron onClick={() => openSub(`m/${def.id}/quellen`)} />
        {def.unit ? <Row title="Einheit" value={def.unit} /> : null}
        {cat ? <Row title="Kategorie" value={cat.label} chevron onClick={() => openSub(cat.id === "medikamente" ? "medikamente" : `k/${cat.id}`)} /> : null}
      </Group>
      <Group>
        <Row glyph="chat" color="var(--claude)" title="Mit Claude besprechen" onClick={() => ask(`Bitte werte ${def.label} von Spotty aus: Wie hat sich der Wert in den letzten Wochen entwickelt, was fällt auf, und was sollten wir mit der Klinik besprechen?`)} />
      </Group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Alle Daten und Herkunft
// ---------------------------------------------------------------------------

export function MetricDataPage({ id, back }: { id: string; back: string }) {
  const def = metricOf(id);
  const src = useSources();
  const s = useSeries(def, src);
  const sheets = useSheets();
  const nameOf = useNameOf();
  const now = useNowValue();
  if (!def || !s) {
    return (
      <Screen>
        <NavBar title="Alle Daten" back={back} />
      </Screen>
    );
  }
  const byDay = new Map<string, typeof s.samples>();
  for (const x of [...s.samples].reverse()) {
    if (!byDay.has(x.day)) byDay.set(x.day, []);
    byDay.get(x.day)!.push(x);
  }
  const days = [...byDay.keys()].slice(0, 120);
  const dec = def.dec ?? 0;
  return (
    <Screen>
      <NavBar title={def.label} back={back} />
      <h1 className="lt">Alle Daten</h1>
      {!days.length ? <p className="muted-c">Noch keine Einträge.</p> : null}
      {def.agg === "plan"
        ? days.map((d) => {
            const dv = s.days.get(d);
            return (
              <Group key={d} header={d === now.day ? "Heute" : fmtDateWd(d)}>
                <Row title={`${fmt(dv?.given ?? 0)} von ${fmt(dv?.due ?? 0)} gegeben`} value={`${fmt(dv?.mid ?? 0)} %`} chevron onClick={() => openSub("medikamente")} />
              </Group>
            );
          })
        : days.map((d) => (
            <Group key={d} header={d === now.day ? "Heute" : fmtDateWd(d)}>
              {byDay.get(d)!.map((x, i) => {
                const e = x.entry;
                const title = e ? summarize(e) || TYPES[e.type]?.label : x.paper ? `${fmt(x.v, dec)} ${def.unit} laut Papierprotokoll` : x.photo ? "Foto vom Papierprotokoll" : def.agg === "state" ? def.states?.find((st) => st.v === x.s)?.label || x.s || "" : `${fmt(x.v, dec)} ${def.unit} aus der Akte`;
                const who = e ? nameOf(e.created_by) : x.photo ? nameOf(x.photo.created_by) : "";
                const onClick = e ? () => sheets.open((close) => <EntrySheet type={e.type} day={e.day} entry={e} onClose={close} />) : x.photo || x.paper ? () => openSub(`protokoll/${x.day}`) : def.id === "nacht" ? () => sheets.open((close) => <NightSheet day={x.day} onClose={close} />) : undefined;
                return <Row key={i} title={title} sub={[x.paper || def.id === "nacht" ? "" : x.time, who, e?.source === "foto" ? "vom Foto" : e?.source === "import" ? "übernommen" : x.hollow ? "nach Bewegung" : ""].filter(Boolean).join(" · ")} chevron={!!onClick} onClick={onClick} />;
              })}
            </Group>
          ))}
    </Screen>
  );
}

export function MetricSourcesPage({ id, back }: { id: string; back: string }) {
  const def = metricOf(id);
  const src = useSources();
  const s = useSeries(def, src);
  const nameOf = useNameOf();
  if (!def || !s) {
    return (
      <Screen>
        <NavBar title="Wer hat eingetragen" back={back} />
      </Screen>
    );
  }
  const counts = new Map<string, { n: number; last: string }>();
  const bump = (k: string, day: string) => {
    const c = counts.get(k) || { n: 0, last: "" };
    c.n++;
    if (day > c.last) c.last = day;
    counts.set(k, c);
  };
  for (const x of s.samples) {
    if (x.entry) {
      if (x.entry.source === "import") bump("Aus der Akte übernommen", x.day);
      else if (x.entry.source === "foto") bump(`Vom Papierfoto${nameOf(x.entry.created_by) ? ` (${nameOf(x.entry.created_by)})` : ""}`, x.day);
      else bump(nameOf(x.entry.created_by) || "Unbekannt", x.day);
    } else if (x.photo) bump(nameOf(x.photo.created_by) || "Unbekannt", x.day);
    else if (x.paper) bump("Tagessumme vom Papierprotokoll", x.day);
    else bump("Akte", x.day);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  return (
    <Screen>
      <NavBar title={def.label} back={back} />
      <h1 className="lt">Wer hat eingetragen</h1>
      <Group footer="Alle in der Familie sehen dieselben Daten; Änderungen erscheinen sofort auf allen Geräten.">
        {rows.length ? rows.map(([k, v]) => <Row key={k} glyph="person" color="var(--blue)" title={k} sub={`zuletzt ${fmtDate(v.last)}`} value={plural(v.n, "Eintrag", "Einträge")} />) : <Row title="Noch keine Einträge" />}
      </Group>
    </Screen>
  );
}

/** Nacht für einen Tag festhalten (wird im Tagesprotokoll unter „Notizen zum Tag“ gespeichert). */
export function NightSheet({ day, onClose }: { day?: string; onClose: () => void }) {
  const now = useNowValue();
  const notes = useDayNotes();
  const [d, setD] = useState(day || now.day);
  const cur = notes.find((n) => n.day === d)?.nacht || null;
  const [v, setV] = useState<string | null>(cur);
  const toast = useToast();
  return (
    <Sheet
      title="Nacht"
      onClose={onClose}
      onDone={() => {
        if (isValidDay(d)) {
          saveDayNote(d, { nacht: v });
          toast.show(v ? `Nacht ${v} gespeichert` : "Angabe zur Nacht entfernt");
        }
        onClose();
      }}
      doneLabel="Speichern"
    >
      <div className="entry-hero" style={{ "--cat": catColor("schlaf") } as CSSProperties}>
        <span className="entry-ic">
          <Glyph name="moon" size={44} />
        </span>
        <p className="entry-title">Nacht</p>
      </div>
      <Group>
        <Row title="Datum" accessory={<input
              className="cap-input"
              type="date"
              value={d}
              max={now.day}
              onChange={(e) => {
                const nd = e.target.value;
                setD(nd);
                setV(notes.find((n) => n.day === nd)?.nacht || null);
              }}
              aria-label="Datum"
            />} />
      </Group>
      <Group header="Wie war die Nacht?" footer={`Die Nacht vor dem ${isValidDay(d) ? fmtDate(d) : "gewählten Tag"}.`}>
        {NIGHT_STATES.map((st) => (
          <Row key={st.v} title={st.label} pressed={v === st.v} onClick={() => setV(v === st.v ? null : st.v)} accessory={v === st.v ? <span className="row-check" aria-label="gewählt"><Icon name="check" size={18} stroke={2.8} /></span> : null} />
        ))}
      </Group>
    </Sheet>
  );
}

