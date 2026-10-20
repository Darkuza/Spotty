// Diagramme in SVG: Messpunkte je Tag mit Tageslinie, Referenzband und Ziellinie; Säulen je Tag.

import { useMemo, useState, type ReactNode } from "react";
import { fmtDM, fmtDayShort } from "@shared/dates.ts";

const W = 360;

export interface ChartPoint {
  day: string;
  minutes: number;
  value: number;
  series: string;
  hollow?: boolean;
}

interface Common {
  days: string[];
  height?: number;
  yMin: number;
  yMax: number;
  yStep: number;
  fmt?: (v: number) => string;
  tipFor?: (day: string) => ReactNode;
  ariaLabel: string;
}

export function niceRange(values: number[], minSpan: number, step: number, floor?: number, ceil?: number): { min: number; max: number } {
  if (!values.length) return { min: floor ?? 0, max: ceil ?? minSpan };
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  if (floor !== undefined) min = Math.max(floor, min);
  if (ceil !== undefined) max = Math.min(ceil, max);
  if (max <= min) max = min + step;
  return { min, max };
}

function useGeometry(days: string[], height: number, yMin: number, yMax: number) {
  return useMemo(() => {
    const ml = 34;
    const mr = 14;
    const mt = 14;
    const mb = 26;
    const pw = W - ml - mr;
    const ph = height - mt - mb;
    const n = days.length;
    const pad = n > 1 ? Math.min(18, pw / (2 * n)) : pw / 2;
    const step = n > 1 ? (pw - 2 * pad) / (n - 1) : 0;
    const xDay = (i: number) => (n > 1 ? ml + pad + i * step : ml + pw / 2);
    const y = (v: number) => mt + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;
    return { ml, mr, mt, mb, pw, ph, n, step, xDay, y, colW: n > 1 ? step : pw };
  }, [days, height, yMin, yMax]);
}

function xLabels(days: string[]): number[] {
  const n = days.length;
  if (n <= 7) return days.map((_, i) => i);
  const every = Math.ceil(n / 6);
  const out: number[] = [];
  for (let i = 0; i < n; i += every) out.push(i);
  if (out[out.length - 1] !== n - 1 && n - 1 - out[out.length - 1] >= every / 2) out.push(n - 1);
  return out;
}

function Axes({ g, days, yMin, yMax, yStep, fmt }: { g: ReturnType<typeof useGeometry>; days: string[]; yMin: number; yMax: number; yStep: number; fmt: (v: number) => string }) {
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) ticks.push(Math.round(v * 100) / 100);
  return (
    <g>
      {ticks.map((v) => (
        <g key={v}>
          <line className="grid" x1={g.ml} x2={W - g.mr} y1={g.y(v)} y2={g.y(v)} />
          <text className="ax" x={g.ml - 6} y={g.y(v) + 4} textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      <line className="base" x1={g.ml} x2={W - g.mr} y1={g.y(yMin)} y2={g.y(yMin)} />
      {xLabels(days).map((i) => (
        <text key={days[i]} className="ax" x={g.xDay(i)} y={g.mt + g.ph + 17} textAnchor="middle">
          {fmtDM(days[i])}
        </text>
      ))}
    </g>
  );
}

function Tip({ show, x, children }: { show: boolean; x: number; children: ReactNode }) {
  if (!show) return null;
  const left = Math.min(Math.max((x / W) * 100, 18), 82);
  return (
    <div className="tip" style={{ left: `${left}%`, top: 4, transform: "translateX(-50%)" }}>
      {children}
    </div>
  );
}

export function PointsChart({
  days,
  points,
  line,
  band,
  refLine,
  colors,
  height = 210,
  yMin,
  yMax,
  yStep,
  fmt = (v) => String(v),
  tipFor,
  ariaLabel,
}: Common & {
  points: ChartPoint[];
  line?: { day: string; value: number }[];
  band?: { from: number; to: number; label: string } | null;
  refLine?: { value: number; label: string } | null;
  colors: Record<string, string>;
}) {
  const g = useGeometry(days, height, yMin, yMax);
  const [tip, setTip] = useState<number | null>(null);
  const idx = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);
  const jitterW = Math.min(g.colW * 0.6, 44);
  const px = (p: ChartPoint) => {
    const i = idx.get(p.day) ?? 0;
    return g.xDay(i) + (p.minutes / 1440 - 0.5) * jitterW;
  };
  const linePts = (line || []).filter((l) => idx.has(l.day)).sort((a, b) => (idx.get(a.day)! - idx.get(b.day)!));
  const clampY = (v: number) => Math.min(Math.max(v, yMin), yMax);
  const last = linePts[linePts.length - 1];
  return (
    <div className="chart" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel}>
        {band ? (
          <g>
            <rect x={g.ml} width={g.pw} y={g.y(clampY(band.to))} height={Math.max(0, g.y(clampY(band.from)) - g.y(clampY(band.to)))} fill="var(--band)" />
            <text className="ax" x={g.ml + 6} y={g.y(clampY(band.to)) + 12}>
              {band.label}
            </text>
          </g>
        ) : null}
        <Axes g={g} days={days} yMin={yMin} yMax={yMax} yStep={yStep} fmt={fmt} />
        {refLine && refLine.value >= yMin && refLine.value <= yMax ? (
          <g>
            <line x1={g.ml} x2={W - g.mr} y1={g.y(refLine.value)} y2={g.y(refLine.value)} stroke="var(--ok)" strokeWidth={1.5} />
            <text className="lbl" x={g.ml + 6} y={g.y(refLine.value) - 5} textAnchor="start" style={{ fill: "var(--ok)" }}>
              {refLine.label}
            </text>
          </g>
        ) : null}
        {linePts.length > 1 ? (
          <polyline
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePts.map((l) => `${g.xDay(idx.get(l.day)!)},${g.y(clampY(l.value))}`).join(" ")}
          />
        ) : null}
        {points.map((p, i) =>
          p.hollow ? (
            <circle key={i} cx={px(p)} cy={g.y(clampY(p.value))} r={4} fill="var(--surface)" stroke="var(--muted)" strokeWidth={1.6} />
          ) : (
            <circle key={i} cx={px(p)} cy={g.y(clampY(p.value))} r={4.5} fill={colors[p.series] || "var(--s1)"} stroke="var(--surface)" strokeWidth={2} />
          ),
        )}
        {linePts.map((l) => (
          <rect key={`m${l.day}`} x={g.xDay(idx.get(l.day)!) - 5} y={g.y(clampY(l.value)) - 1.5} width={10} height={3} rx={1.5} fill="var(--ink)" />
        ))}
        {last ? (
          <text className="lbl" x={Math.min(g.xDay(idx.get(last.day)!) + 8, W - g.mr - 14)} y={g.y(clampY(last.value)) - 8}>
            {fmt(last.value)}
          </text>
        ) : null}
        {tipFor
          ? days.map((d, i) => (
              <rect
                key={`h${d}`}
                x={g.xDay(i) - Math.max(g.colW, 24) / 2}
                y={g.mt}
                width={Math.max(g.colW, 24)}
                height={g.ph}
                fill="transparent"
                tabIndex={0}
                onPointerEnter={() => setTip(i)}
                onClick={() => setTip((t) => (t === i ? null : i))}
                onFocus={() => setTip(i)}
                onBlur={() => setTip(null)}
              >
                <title>{fmtDayShort(d)}</title>
              </rect>
            ))
          : null}
        {tip !== null ? <line x1={g.xDay(tip)} x2={g.xDay(tip)} y1={g.mt} y2={g.mt + g.ph} stroke="var(--line-strong)" strokeWidth={1} /> : null}
      </svg>
      {tipFor && tip !== null ? (
        <Tip show x={g.xDay(tip)}>
          {tipFor(days[tip])}
        </Tip>
      ) : null}
    </div>
  );
}

export function BarsChart({ days, values, color = "var(--s1)", height = 170, yMin, yMax, yStep, fmt = (v) => String(v), tipFor, ariaLabel, refLine }: Common & { values: (number | null)[]; color?: string; refLine?: { value: number; label: string } | null }) {
  const g = useGeometry(days, height, yMin, yMax);
  const [tip, setTip] = useState<number | null>(null);
  const bw = Math.max(4, Math.min(24, g.colW * 0.62));
  return (
    <div className="chart" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel}>
        <Axes g={g} days={days} yMin={yMin} yMax={yMax} yStep={yStep} fmt={fmt} />
        {refLine && refLine.value <= yMax ? (
          <g>
            <line x1={g.ml} x2={W - g.mr} y1={g.y(refLine.value)} y2={g.y(refLine.value)} stroke="var(--ok)" strokeWidth={1.5} />
            <text className="lbl" x={W - g.mr} y={g.y(refLine.value) - 5} textAnchor="end" style={{ fill: "var(--ok)" }}>
              {refLine.label}
            </text>
          </g>
        ) : null}
        {values.map((v, i) => {
          if (v == null || v <= yMin) return null;
          const top = g.y(Math.min(v, yMax));
          const base = g.y(yMin);
          const h = base - top;
          const x = g.xDay(i) - bw / 2;
          const r = Math.min(4, h / 2, bw / 2);
          const d = `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`;
          return <path key={days[i]} d={d} fill={color} opacity={tip === null || tip === i ? 1 : 0.55} />;
        })}
        {tipFor
          ? days.map((d, i) => (
              <rect
                key={`h${d}`}
                x={g.xDay(i) - Math.max(g.colW, 24) / 2}
                y={g.mt}
                width={Math.max(g.colW, 24)}
                height={g.ph}
                fill="transparent"
                tabIndex={0}
                onPointerEnter={() => setTip(i)}
                onClick={() => setTip((t) => (t === i ? null : i))}
                onFocus={() => setTip(i)}
                onBlur={() => setTip(null)}
              />
            ))
          : null}
      </svg>
      {tipFor && tip !== null ? (
        <Tip show x={g.xDay(tip)}>
          {tipFor(days[tip])}
        </Tip>
      ) : null}
    </div>
  );
}

/** Kleiner Verlauf für eine Laborzeile. */
export function Sparkline({ values, width = 90, height = 24, refLow, refHigh }: { values: number[]; width?: number; height?: number; refLow?: number | null; refHigh?: number | null }) {
  if (values.length < 2) return null;
  const all = [...values, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6);
  const x = (i: number) => 3 + (i * (width - 6)) / (values.length - 1);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {refLow != null && refHigh != null ? <rect x={0} width={width} y={y(refHigh)} height={Math.max(1, y(refLow) - y(refHigh))} fill="var(--band)" /> : null}
      <polyline fill="none" stroke="var(--ink-2)" strokeWidth={1.6} points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.6} fill="var(--s1)" />
    </svg>
  );
}
