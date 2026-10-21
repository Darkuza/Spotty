// Diagramme im Stil der Health-App: kleine Verläufe auf den Karten, das große Diagramm der Messwertseite
// mit Auswahl und Wischen, und die Diagramme der Highlights.

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { addDays, dayRange } from "@shared/dates.ts";
import type { MetricDef } from "../../lib/health/metrics";
import type { ColVal, DayVal, RangeKey, Scale } from "../../lib/health/series";
import type { HlChart } from "../../lib/health/highlights";
import { fmt, fmtMax } from "../../lib/health/format";

function useWidth(ref: RefObject<HTMLElement | null>, fallback = 340): number {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = Math.round(el.clientWidth);
      if (cw > 0) setW(cw);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Säule mit leicht gerundeter Oberkante. */
function barPath(x: number, top: number, w: number, base: number, r = 3): string {
  const h = base - top;
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${base} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${base} Z`;
}

const LEVEL_COLOR = ["var(--cat)", "var(--orange)", "var(--red)"];

// ---------------------------------------------------------------------------
// Kleiner Verlauf auf den Karten
// ---------------------------------------------------------------------------

export function MiniChart({ def, days, today }: { def: MetricDef; days: Map<string, DayVal>; today: string }) {
  const W = 76;
  const H = 50;
  const list = dayRange(addDays(today, -6), today);
  if (def.agg === "point" || def.agg === "state") {
    // die letzten Werte als verbundene Punkte
    const vals = [...days.values()]
      .filter((d) => d.day <= today && d.last)
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-7)
      .map((d) => d.last!.v);
    if (!vals.length) return null;
    const lo = def.agg === "state" ? 0 : Math.min(...vals);
    const hi = def.agg === "state" ? 2 : Math.max(...vals);
    const span = hi - lo || 1;
    const x = (i: number) => (vals.length === 1 ? W - 6 : 6 + (i * (W - 12)) / (vals.length - 1));
    const y = (v: number) => (def.agg === "state" ? 6 + ((v - lo) / span) * (H - 12) : H - 6 - ((v - lo) / span) * (H - 12));
    return (
      <svg className="mini" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {vals.length > 1 ? <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--mini)" strokeWidth={2} /> : null}
        {vals.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3.6} fill="var(--surface)" stroke={i === vals.length - 1 ? "var(--cat)" : "var(--mini)"} strokeWidth={2.2} />
        ))}
      </svg>
    );
  }
  const n = list.length;
  const slot = W / n;
  const bw = Math.min(8.5, slot * 0.72);
  if (def.agg === "range") {
    const vals = list.map((d) => days.get(d)).filter((d): d is DayVal => !!d && d.lo !== null);
    if (!vals.length) return null;
    const lo = Math.min(...vals.map((d) => d.lo as number));
    const hi = Math.max(...vals.map((d) => d.hi as number));
    const span = hi - lo || 10;
    const y = (v: number) => H - 3 - ((v - lo) / span) * (H - 6) * 0.9;
    return (
      <svg className="mini" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {list.map((d, i) => {
          const dv = days.get(d);
          if (!dv || dv.lo === null || dv.hi === null) return null;
          const x = i * slot + (slot - bw) / 2;
          const top = y(dv.hi);
          const bot = Math.max(top + bw, y(dv.lo));
          return <rect key={d} x={x} y={top - (bot - top < bw ? bw / 2 : 0)} width={bw} height={Math.max(bw, bot - top)} rx={bw / 2} fill={i === n - 1 ? "var(--cat)" : "var(--mini)"} />;
        })}
      </svg>
    );
  }
  const vals = list.map((d) => {
    const dv = days.get(d);
    if (!dv) return null;
    return def.agg === "plan" ? dv.mid : dv.total;
  });
  const max = Math.max(...vals.map((v) => v ?? 0), def.agg === "plan" ? 100 : 0);
  if (max <= 0) return null;
  return (
    <svg className="mini" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {vals.map((v, i) => {
        const x = i * slot + (slot - bw) / 2;
        const h = v ? Math.max(3, (v / max) * (H - 2)) : 3;
        return <path key={i} d={barPath(x, H - h, bw, H, 2)} fill={i === n - 1 && v ? "var(--cat)" : "var(--mini)"} opacity={v ? 1 : 0.6} />;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Großes Diagramm der Messwertseite
// ---------------------------------------------------------------------------

export interface Marker {
  day: string;
  label: string;
  /** kleiner = wichtiger; wichtige Markierungen bekommen zuerst Platz für ihre Beschriftung */
  prio?: number;
}

export function DetailChart({
  def,
  range,
  cols,
  scale,
  selected,
  onSelect,
  onSwipe,
  markers,
  ariaLabel,
}: {
  def: MetricDef;
  range: RangeKey;
  cols: ColVal[];
  scale: Scale;
  selected: number | null;
  onSelect: (i: number | null) => void;
  onSwipe: (dir: -1 | 1) => void;
  markers?: Marker[];
  ariaLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const W = useWidth(box);
  const H = 236;
  // Einschätzungen tragen ihre Stufen in der Fläche, Zahlen stehen rechts daneben
  const states = def.agg === "state";
  const right = states ? 8 : 44;
  const bottom = 26;
  const pw = W - right;
  const n = cols.length;
  const colW = pw / n;
  const x0 = (i: number) => i * colW;
  const cx = (i: number) => x0(i) + colW / 2;

  // Markierungen: je Spalte jeder Text nur einmal. Beschriftet wird nur die Wochenansicht, über der Fläche
  // in höchstens zwei Reihen, ohne Überlappung und nie über der Achse rechts.
  const lines: { x: number; idx: number; row: number | null }[] = [];
  const labels: { x: number; anchor: "start" | "end"; row: number; text: string }[] = [];
  {
    const byCol = new Map<number, { texts: string[]; prio: number }>();
    for (const m of markers || []) {
      const idx = cols.findIndex((c) => m.day >= c.col.from && m.day <= c.col.to);
      if (idx < 0) continue;
      const cur = byCol.get(idx) || { texts: [], prio: 9 };
      if (!cur.texts.includes(m.label)) cur.texts.push(m.label);
      cur.prio = Math.min(cur.prio, m.prio ?? 5);
      byCol.set(idx, cur);
    }
    const taken: [number, number][][] = [[], []];
    const order = [...byCol.entries()].sort((a, b) => a[1].prio - b[1].prio || a[0] - b[0]);
    const rowOf = new Map<number, number>();
    for (const [idx, { texts }] of order) {
      if (range !== "W") break;
      const x = x0(idx) + 0.5;
      const text = texts.join(", ");
      const w = text.length * 6.3 + 4;
      const anchor: "start" | "end" = x + 3 + w > pw ? "end" : "start";
      const from = anchor === "start" ? x + 3 : x - 3 - w;
      if (from < 0) continue;
      const to = from + w;
      const r = taken.findIndex((row) => row.every(([a, b]) => to + 6 <= a || from >= b + 6));
      if (r < 0) continue;
      taken[r].push([from, to]);
      rowOf.set(idx, r);
      labels.push({ x: anchor === "start" ? x + 3 : x - 3, anchor, row: r, text });
    }
    for (const idx of [...byCol.keys()].sort((a, b) => a - b)) {
      const x = range === "W" || range === "M" ? x0(idx) + 0.5 : cx(idx);
      lines.push({ x, idx, row: rowOf.get(idx) ?? null });
    }
  }
  const labelRows = labels.length ? Math.max(...labels.map((l) => l.row)) + 1 : 0;
  const top = 12 + labelRows * 13;
  const ph = H - top - bottom;
  const y = (v: number) => top + ph - ((Math.min(Math.max(v, scale.min), scale.max) - scale.min) / (scale.max - scale.min || 1)) * ph;
  const base = top + ph;
  const down = useRef<{ x: number; t: number } | null>(null);
  const bw = Math.max(3, Math.min(colW * 0.62, 34));
  const capW = Math.max(4, Math.min(colW * 0.42, 11));
  const dim = (i: number) => (selected !== null && selected !== i ? 0.35 : 1);
  const tickFmt = (v: number) => (def.agg === "state" ? def.states?.find((s) => s.level === v)?.label || "" : def.agg === "plan" ? `${fmt(v)} %` : fmtMax(v, def.dec ?? 0));

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return null;
    const i = Math.floor(((clientX - rect.left) / pw) * n);
    return i >= 0 && i < n ? i : null;
  };
  const onDown = (e: PointerEvent) => {
    down.current = { x: e.clientX, t: Date.now() };
  };
  const onUp = (e: PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 40) {
      onSwipe(dx > 0 ? -1 : 1);
      return;
    }
    const i = pick(e.clientX);
    if (i === null) onSelect(null);
    else onSelect(selected === i ? null : i);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSelect(selected === null ? n - 1 : Math.max(0, selected - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSelect(selected === null ? 0 : Math.min(n - 1, selected + 1));
    } else if (e.key === "Escape") onSelect(null);
  };

  const pointsLine =
    def.agg === "point" && range !== "T"
      ? cols
          .map((c, i) => (c.v !== null ? `${cx(i)},${y(c.v)}` : null))
          .filter(Boolean)
          .join(" ")
      : "";

  return (
    <div className="dchart" ref={box} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (down.current = null)} onKeyDown={onKey} tabIndex={0} role="img" aria-label={ariaLabel}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* waagerechte Linien und Achse rechts */}
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={pw} y1={y(t)} y2={y(t)} className="dc-grid" />
            {states ? (
              <text x={6} y={t === scale.min ? y(t) - 6 : y(t) + 15} className="dc-ax">
                {tickFmt(t)}
              </text>
            ) : (
              <text x={pw + 6} y={y(t) + 4} className="dc-ax">
                {tickFmt(t)}
              </text>
            )}
          </g>
        ))}
        {/* senkrechte Trennlinien */}
        <line x1={0.5} x2={0.5} y1={top} y2={base + 20} className="dc-grid" />
        {cols.map((c, i) =>
          c.col.sep && i > 0 ? <line key={`s${i}`} x1={x0(i)} x2={x0(i)} y1={top} y2={base + 20} className="dc-grid dash" /> : null,
        )}
        <line x1={pw} x2={pw} y1={top} y2={base + 20} className="dc-grid dash" />
        {cols.map((c, i) =>
          c.col.label ? (
            <text key={`l${i}`} x={x0(i) + 4} y={H - 6} className="dc-ax">
              {c.col.label}
            </text>
          ) : null,
        )}
        {/* Orientierungslinie */}
        {def.ref && def.ref.value >= scale.min && def.ref.value <= scale.max ? (
          <g>
            <line x1={0} x2={pw} y1={y(def.ref.value)} y2={y(def.ref.value)} className="dc-ref" />
          </g>
        ) : null}
        {/* Markierungen (Therapiebeginn, Dosiswechsel, Klinik) */}
        {lines.map((m) => (
          <line key={`m${m.idx}`} x1={m.x} x2={m.x} y1={m.row === null ? top : 2 + m.row * 13} y2={base} className="dc-mark" />
        ))}
        {labels.map((l) => (
          <text key={`ml${l.row}-${l.x}`} x={l.x} y={11 + l.row * 13} textAnchor={l.anchor} className="dc-mark-l">
            {l.text}
          </text>
        ))}
        {/* Werte */}
        {cols.map((c, i) => {
          const op = dim(i);
          if (def.agg === "sum" || def.agg === "count" || def.agg === "plan") {
            if (c.v === null || c.v <= 0) return null;
            return <path key={`v${i}`} d={barPath(cx(i) - bw / 2, y(c.v), bw, base, 3)} fill="var(--cat)" opacity={op} />;
          }
          if (def.agg === "range") {
            const out = [];
            if (c.lo !== null && c.hi !== null && range !== "T") {
              const t = y(c.hi);
              const b = y(c.lo);
              out.push(<rect key={`r${i}`} x={cx(i) - capW / 2} y={b - t < capW ? (t + b) / 2 - capW / 2 : t} width={capW} height={Math.max(capW, b - t)} rx={capW / 2} fill="var(--cat)" opacity={op} />);
            }
            for (const [k, p] of c.pts.entries()) {
              const px = range === "T" ? x0(i) + p.x * colW : cx(i);
              out.push(
                p.hollow ? (
                  <circle key={`p${i}-${k}`} cx={px} cy={y(p.v)} r={4} fill="var(--bg-chart)" stroke="var(--cat)" strokeWidth={2} opacity={op} />
                ) : (
                  <circle key={`p${i}-${k}`} cx={px} cy={y(p.v)} r={4.5} fill="var(--cat)" opacity={op} />
                ),
              );
            }
            return out;
          }
          if (def.agg === "point") {
            if (range === "T") return c.pts.map((p, k) => <circle key={`p${i}-${k}`} cx={x0(i) + p.x * colW} cy={y(p.v)} r={4.5} fill="var(--cat)" opacity={op} />);
            if (c.v === null) return null;
            return <circle key={`v${i}`} cx={cx(i)} cy={y(c.v)} r={4.5} fill="var(--cat)" stroke="var(--bg-chart)" strokeWidth={1.5} opacity={op} />;
          }
          // Einschätzungen: Punkte je Stufe
          const levels = range === "T" || (range !== "6M" && range !== "J") ? (c.pts.length ? c.pts.map((p) => p.v) : c.v !== null ? [c.v] : []) : c.v !== null ? [c.v] : [];
          return levels.map((lv, k) => <circle key={`s${i}-${k}`} cx={range === "T" && c.pts[k] ? x0(i) + c.pts[k].x * colW : cx(i)} cy={y(lv)} r={4.5} fill={LEVEL_COLOR[Math.round(lv)] || "var(--cat)"} opacity={op} />);
        })}
        {pointsLine ? <polyline points={pointsLine} fill="none" stroke="var(--cat)" strokeWidth={1.6} opacity={selected === null ? 0.45 : 0.2} /> : null}
        {selected !== null ? <line x1={cx(selected)} x2={cx(selected)} y1={top - 6} y2={base} className="dc-sel" /> : null}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagramme der Highlights
// ---------------------------------------------------------------------------

export function HighlightChart({ chart, now }: { chart: HlChart; now?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const W = useWidth(box, 320);
  if (chart.kind === "cum") {
    const H = 190;
    const top = 14;
    const bottom = 30;
    const ph = H - top - bottom;
    const steps = chart.usual.length - 1;
    const max = Math.max(1, ...chart.usual, ...chart.today) * 1.08;
    const x = (i: number) => 4 + (i / steps) * (W - 8);
    const y = (v: number) => top + ph - (v / max) * ph;
    const line = (vals: number[]) => vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const nx = x(chart.nowIdx);
    // Uhrzeit-Beschriftungen: „jetzt“ in der Mitte darf die Ränder (00:00, 24:00) nicht überdecken.
    const LW = 34;
    const nowX = Math.min(Math.max(nx, 4 + LW / 2), W - 4 - LW / 2);
    const showStart = !now || nowX - LW / 2 > 4 + LW + 6;
    const showEnd = !now || nowX + LW / 2 < W - 4 - LW - 6;
    return (
      <span className="hchart" ref={box}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <polyline points={line(chart.usual)} fill="none" stroke="var(--label-3)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={line(chart.today)} fill="none" stroke="var(--cat)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          <line x1={nx} x2={nx} y1={top - 6} y2={top + ph + 6} stroke="var(--label-3)" strokeWidth={1.5} />
          <circle cx={nx} cy={y(chart.usual[chart.nowIdx])} r={5} fill="var(--label-3)" stroke="var(--surface)" strokeWidth={2} />
          <circle cx={nx} cy={y(chart.today[chart.today.length - 1])} r={5} fill="var(--cat)" stroke="var(--surface)" strokeWidth={2} />
          {Array.from({ length: 25 }).map((_, h) => (
            <circle key={h} cx={x((h * 60) / chart.step)} cy={top + ph + 8} r={h % 6 === 0 ? 0 : 1.1} fill="var(--label-3)" />
          ))}
          {[0, 24].map((h) => (
            <line key={h} x1={x((h * 60) / chart.step)} x2={x((h * 60) / chart.step)} y1={top + ph + 3} y2={top + ph + 13} stroke="var(--label-3)" strokeWidth={1.6} />
          ))}
          {showStart ? (
            <text x={4} y={H - 4} className="hc-ax">
              00:00
            </text>
          ) : null}
          {now ? (
            <text x={nowX} y={H - 4} className="hc-ax" textAnchor="middle">
              {now}
            </text>
          ) : null}
          {showEnd ? (
            <text x={W - 4} y={H - 4} className="hc-ax" textAnchor="end">
              24:00
            </text>
          ) : null}
        </svg>
      </span>
    );
  }
  const H = 150;
  const top = 10;
  const bottom = 24;
  const ph = H - top - bottom;
  const left = 0;
  const pw = W - left;
  const labels = chart.labels;
  const n = labels.length;
  const slot = pw / n;
  if (chart.kind === "bars") {
    const max = Math.max(1, ...chart.values.map((v) => v ?? 0), chart.avg ?? 0) * 1.05;
    const y = (v: number) => top + ph - (v / max) * ph;
    const bw = Math.min(slot * 0.5, 16);
    return (
      <span className="hchart" ref={box}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {chart.values.map((v, i) => (v ? <path key={i} d={barPath(left + i * slot + (slot - bw) / 2, y(v), bw, top + ph, 3)} fill="var(--mini)" /> : null))}
          {chart.avg !== null ? <line x1={2} x2={W - 2} y1={y(chart.avg)} y2={y(chart.avg)} stroke="var(--cat)" strokeWidth={4} strokeLinecap="round" /> : null}
          {labels.map((l, i) => (
            <text key={i} x={left + i * slot + slot / 2} y={H - 4} className="hc-ax" textAnchor="middle">
              {l}
            </text>
          ))}
        </svg>
      </span>
    );
  }
  if (chart.kind === "range") {
    const all = [...chart.lo, ...chart.hi].filter((v): v is number => v !== null);
    const lo = Math.min(...all) - 1;
    const hi = Math.max(...all) + 1;
    const y = (v: number) => top + ph - ((v - lo) / (hi - lo || 1)) * ph;
    const cw = Math.min(slot * 0.32, 10);
    return (
      <span className="hchart" ref={box}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {chart.lo.map((l, i) => {
            const h = chart.hi[i];
            if (l === null || h === null) return null;
            const t = y(h);
            const b = y(l);
            return <rect key={i} x={left + i * slot + (slot - cw) / 2} y={b - t < cw ? (t + b) / 2 - cw / 2 : t} width={cw} height={Math.max(cw, b - t)} rx={cw / 2} fill={i === n - 1 ? "var(--cat)" : "var(--mini)"} />;
          })}
          {labels.map((l, i) => (
            <text key={i} x={left + i * slot + slot / 2} y={H - 4} className="hc-ax" textAnchor="middle">
              {l}
            </text>
          ))}
        </svg>
      </span>
    );
  }
  const vals = chart.values;
  const nums = vals.filter((v): v is number => v !== null);
  const lo = Math.min(...nums) - 0.5;
  const hi = Math.max(...nums) + 0.5;
  const y = (v: number) => top + ph - ((v - lo) / (hi - lo || 1)) * ph;
  const xs = (i: number) => left + i * slot + slot / 2;
  const pts = vals.map((v, i) => (v !== null ? `${xs(i)},${y(v)}` : null)).filter(Boolean);
  return (
    <span className="hchart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {pts.length > 1 ? <polyline points={pts.join(" ")} fill="none" stroke="var(--mini)" strokeWidth={2} /> : null}
        {vals.map((v, i) => (v !== null ? <circle key={i} cx={xs(i)} cy={y(v)} r={4.5} fill="var(--cat)" /> : null))}
        {/* nur erste und letzte Beschriftung, sonst überlappen die Daten auf schmaler Fläche */}
        {edgeLabels(labels).map(({ i, l, anchor }) => (
          <text key={i} x={anchor === "start" ? 0 : anchor === "end" ? W : xs(i)} y={H - 4} className="hc-ax" textAnchor={anchor}>
            {l}
          </text>
        ))}
      </svg>
    </span>
  );
}

function edgeLabels(labels: (string | null)[]): { i: number; l: string; anchor: "start" | "middle" | "end" }[] {
  const idx = labels.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  const first = idx[0];
  const last = idx[idx.length - 1];
  if (first === last) return [{ i: first, l: labels[first] as string, anchor: "middle" }];
  return [
    { i: first, l: labels[first] as string, anchor: "start" },
    { i: last, l: labels[last] as string, anchor: "end" },
  ];
}
