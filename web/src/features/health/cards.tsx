// Karten der Health-Ansichten: Messwertkarte (Angepinnt, Kategorien) und Highlight-Karte.

import type { CSSProperties } from "react";
import { Glyph } from "../../ui/Glyph";
import { Icon } from "../../ui/Icon";
import { useNowValue } from "../../lib/now";
import { catColor, type MetricDef } from "../../lib/health/metrics";
import { fmt, fmtWhen } from "../../lib/health/format";
import type { Highlight } from "../../lib/health/highlights";
import { metricOf, unitFor } from "../../lib/health/metrics";
import type { Series } from "./useHealth";
import { MiniChart, HighlightChart } from "./charts";

export interface Latest {
  day: string;
  time: string | null;
  label: string | null;
  value: string;
  unit: string;
}

/** Was eine Karte groß zeigt: heutige Summe, letzter Messwert oder letzte Einschätzung. */
export function latestOf(def: MetricDef, s: Series, today: string): Latest | null {
  if (def.agg === "plan") {
    const dv = s.days.get(today);
    if (dv && dv.due) return { day: today, time: null, label: null, value: `${fmt(dv.given)}`, unit: `von ${fmt(dv.due)} gegeben` };
    const last = [...s.days.values()].filter((d) => d.day <= today).sort((a, b) => b.day.localeCompare(a.day))[0];
    if (!last || !last.due) return null;
    return { day: last.day, time: null, label: null, value: fmt(last.mid, 0), unit: "%" };
  }
  const samples = s.samples.filter((x) => x.day <= today);
  const last = samples[samples.length - 1];
  if (!last) return null;
  const dec = def.dec ?? 0;
  if (def.agg === "sum" || def.agg === "count") {
    const dv = s.days.get(last.day);
    const lastTime = last.paper ? null : last.time;
    const value = fmt(dv?.total ?? last.v, dec);
    return { day: last.day, time: lastTime, label: null, value, unit: unitFor(def, value) };
  }
  if (def.agg === "state") {
    const st = def.states?.find((x) => x.v === last.s);
    return { day: last.day, time: last.time, label: "Zuletzt", value: st?.label || last.s || "–", unit: "" };
  }
  return { day: last.day, time: last.time, label: "Neueste", value: fmt(last.v, dec), unit: def.unit };
}

export function MetricCard({ def, series, onClick }: { def: MetricDef; series: Series; onClick: () => void }) {
  const now = useNowValue();
  const latest = latestOf(def, series, now.day);
  const when = latest ? fmtWhen(latest.day, latest.time, now.day) : "";
  return (
    <button type="button" className="mcard" style={{ "--cat": catColor(def.cat) } as CSSProperties} onClick={onClick} aria-label={`${def.label}: ${latest ? `${latest.value} ${latest.unit}` : "keine Daten"}`}>
      <span className="mcard-h">
        <span className="mcard-t">
          <Glyph name={def.glyph} size={20} />
          <span>{def.label}</span>
        </span>
        <span className="mcard-w">
          {when}
          <Icon name="right" size={14} stroke={2.6} />
        </span>
      </span>
      <span className="mcard-b">
        {latest ? (
          <span className="mcard-v">
            {latest.label ? <span className="mcard-k">{latest.label}</span> : null}
            <span className="mcard-n">
              {latest.value}
              {latest.unit ? <small>{latest.unit}</small> : null}
            </span>
          </span>
        ) : (
          <span className="mcard-v">
            <span className="mcard-n none">Keine Daten</span>
          </span>
        )}
        <MiniChart def={def} days={series.days} today={now.day} />
      </span>
    </button>
  );
}

export function HighlightCard({ hl, onClick }: { hl: Highlight; onClick?: () => void }) {
  const now = useNowValue();
  const def = metricOf(hl.metric);
  if (!def) return null;
  const side = hl.chart.kind !== "cum";
  const inner = (
    <>
      <span className="hcard-h">
        <span className="mcard-t">
          <Glyph name={def.glyph} size={20} />
          <span>{def.label}</span>
        </span>
        {onClick ? <Icon name="right" size={14} stroke={2.6} /> : null}
      </span>
      <span className="hcard-text">{hl.text}</span>
      <span className="hcard-sep" aria-hidden="true" />
      <span className={`hcard-body${side ? " side" : ""}`}>
        <span className="hstats">
          {hl.stats.map((s) => (
            <span key={s.label} className={`hstat${s.gray ? " gray" : ""}`}>
              <span className="hstat-l">
                {hl.chart.kind === "cum" ? <i aria-hidden="true" /> : null}
                {s.label}
              </span>
              <span className="hstat-v">
                {s.value}
                <small>{s.unit}</small>
              </span>
            </span>
          ))}
        </span>
        <HighlightChart chart={hl.chart} now={now.hm} />
      </span>
    </>
  );
  const style = { "--cat": catColor(def.cat) } as CSSProperties;
  if (!onClick)
    return (
      <div className="hcard" style={style}>
        {inner}
      </div>
    );
  return (
    <button type="button" className="hcard" style={style} onClick={onClick}>
      {inner}
    </button>
  );
}
