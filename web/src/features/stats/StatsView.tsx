// Verlauf: Kennzahlen, Diagramme und Tagestabelle über einen Zeitraum.

import { useMemo, useState } from "react";
import { useChecks, useDayNotes, useEntries, useEvents, usePhotos, useProfile, useRegimens } from "../../lib/data";
import { useMembers } from "../../lib/session";
import { Seg } from "../../ui/controls";
import { BarsChart, PointsChart, niceRange, type ChartPoint } from "../../ui/Chart";
import { Icon } from "../../ui/Icon";
import { useSheets, useToast } from "../../ui/overlays";
import { ReportSheet } from "./ReportSheet";
import { addDays, dayRange, fmtDM, fmtDayShort, minutesOf, type BerlinNow } from "@shared/dates.ts";
import { LAGE_KURZ, fmtNum, num } from "@shared/entryTypes.ts";
import { dayStats, fluidOfDay, foodOfDay, median } from "@shared/stats.ts";
import { itemState, itemsForDay, therapyStart } from "@shared/plan.ts";
import type { DayNote } from "@shared/types.ts";
import { copyText, downloadText } from "../../lib/files";
import { csv, rangeText } from "../../lib/report";

type Range = "therapie" | "7" | "14" | "30" | "alle";

export function StatsView({ now, onAsk }: { now: BerlinNow; onAsk: (prompt: string) => void }) {
  const entries = useEntries();
  const notes = useDayNotes();
  const regimens = useRegimens();
  const checks = useChecks();
  const photos = usePhotos();
  const members = useMembers();
  const profile = useProfile();
  const toast = useToast();
  const sheets = useSheets();
  const start = useMemo(() => therapyStart(regimens), [regimens]);
  const [range, setRange] = useState<Range>(start ? "therapie" : "14");

  const firstDay = useMemo(() => {
    const ds = entries.map((e) => e.day).sort();
    return ds[0] || now.day;
  }, [entries, now.day]);

  const from = range === "therapie" && start ? (start <= now.day ? start : addDays(now.day, -6)) : range === "alle" ? firstDay : addDays(now.day, -(parseInt(range, 10) - 1));
  const days = useMemo(() => dayRange(from, now.day), [from, now.day]);
  const noteOf = (d: string): DayNote | null => notes.find((n) => n.day === d) || null;
  const stats = useMemo(() => days.map((d) => dayStats(entries, d, noteOf(d))), [days, entries, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ausgangswerte der Atemzüge vor Therapiebeginn (aus dem Protokoll)
  const baseline = useMemo(() => {
    const vals = entries.filter((e) => e.type === "atem" && !!start && e.day < start).map((e) => num((e.data as Record<string, unknown>).bpm)).filter((v): v is number => v != null);
    return vals.length ? { min: Math.min(...vals), max: Math.max(...vals), n: vals.length } : null;
  }, [entries, start]);

  const atemPoints: ChartPoint[] = [];
  stats.forEach((s) => s.atem.forEach((a) => atemPoints.push({ day: s.day, minutes: minutesOf(a.time), value: a.bpm, series: a.zustand === "schlaeft" ? "schlaeft" : "ruhig", hollow: a.zustand === "aktiv" })));
  const atemLine = stats.filter((s) => s.atemWert != null).map((s) => ({ day: s.day, value: s.atemWert as number }));
  const atemVals = [...atemPoints.map((p) => p.value), ...(baseline ? [baseline.min, baseline.max] : []), 40];
  const atemRange = niceRange(atemVals, 30, 10, 0);

  const spoPoints: ChartPoint[] = [];
  stats.forEach((s) => s.spo2.forEach((p) => spoPoints.push({ day: s.day, minutes: minutesOf(p.time), value: p.pct, series: "spo2" })));
  const spoRange = niceRange([...spoPoints.map((p) => p.value), 95, 100], 8, 2, 70, 100);

  const weightPoints: ChartPoint[] = [];
  stats.forEach((s) => {
    if (s.kg != null) weightPoints.push({ day: s.day, minutes: 480, value: s.kg, series: "kg" });
  });
  for (const w of profile?.data?.weights || []) {
    if (w.date >= from && w.date <= now.day && !weightPoints.some((p) => p.day === w.date)) weightPoints.push({ day: w.date, minutes: 720, value: w.kg, series: "kg" });
  }
  const weightRange = niceRange(weightPoints.map((p) => p.value), 2, 0.5);

  const fluids = stats.map((s) => fluidOfDay(s).ml);
  const foods = stats.map((s) => foodOfDay(s).g);
  const fluidMax = niceRange([...fluids.filter((v): v is number => v != null), 100], 100, 100, 0);
  const foodMax = niceRange([...foods.filter((v): v is number => v != null), 100], 100, 100, 0);

  // Kennzahlen
  const lastAtem = [...stats].reverse().find((s) => s.atemWert != null);
  const atemTrend = atemLine.length >= 2 ? atemLine[atemLine.length - 1].value - atemLine[0].value : null;
  const spoAll = stats.flatMap((s) => s.spo2.map((x) => x.pct));
  const weights = weightPoints.sort((a, b) => a.day.localeCompare(b.day));
  const lastW = weights[weights.length - 1];
  const firstW = weights[0];
  const fluidDays = fluids.filter((v): v is number => v != null);
  const foodDays = foods.filter((v): v is number => v != null);
  let planTotal = 0;
  let planDone = 0;
  for (const d of days) {
    const items = itemsForDay(regimens, d).filter((it) => it.kind === "check" && (d < now.day || minutesOf(it.time) <= now.minutes));
    planTotal += items.length;
    planDone += items.filter((it) => itemState(it, d, checks, entries, photos).done).length;
  }

  // Markierungen: Dosiswechsel bei Stufenplänen und Klinikbesuche
  const events = useEvents();
  const markers = useMemo(() => {
    const byDay = new Map<string, string[]>();
    const add = (d: string, label: string) => {
      if (d < from || d > now.day) return;
      if (!byDay.has(d)) byDay.set(d, []);
      if (!byDay.get(d)!.includes(label)) byDay.get(d)!.push(label);
    };
    if (start) add(start, "Therapiebeginn");
    for (const r of regimens) {
      if (!r.active || r.category !== "med") continue;
      const steps = [...(r.steps || [])].sort((a, b) => a.from.localeCompare(b.from));
      const short = r.name.split(" ")[0];
      for (let i = 1; i < steps.length; i++) if (steps[i].dose && steps[i].dose !== steps[i - 1].dose) add(steps[i].from, `${short} ${steps[i].dose}`);
    }
    for (const e of events) if (e.category === "klinik") add(e.date, "Klinik");
    return [...byDay.entries()].map(([day, labels]) => ({ day, label: labels.join(", ") }));
  }, [regimens, events, from, now.day, start]);

  // Atemzüge in Ruhe nach Liegeseite (Median je Seite im Zeitraum)
  const bySide = (() => {
    const groups = new Map<string, number[]>();
    for (const st of stats)
      for (const a of st.atem) {
        if (a.zustand === "aktiv") continue;
        const k = a.lage || "";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(a.bpm);
      }
    const order = ["links", "rechts", "brust", "ruecken", "sitzt", ""];
    return [...groups.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([k, v]) => ({ k, label: k ? LAGE_KURZ[k] || k : "ohne Angabe", n: v.length, med: median(v) as number, min: Math.min(...v), max: Math.max(...v) }));
  })();
  const hasSides = bySide.some((g) => g.k);

  const atemTip = (d: string) => {
    const s = stats[days.indexOf(d)];
    const mk = markers.find((m) => m.day === d);
    if (!s || !s.atem.length) return <span>{fmtDayShort(d)}: keine Zählung{mk ? ` · ${mk.label}` : ""}</span>;
    return (
      <span>
        <b>{s.atemWert != null ? `${fmtNum(s.atemWert)}/min` : "–"}</b> {fmtDayShort(d)}
        {mk ? ` · ${mk.label}` : ""}
        <br />
        {s.atem
          .map((a) => `${a.time} ${fmtNum(a.bpm)}${a.zustand === "schlaeft" ? " Schlaf" : a.zustand === "aktiv" ? " Bewegung" : ""}${a.lage ? `, ${LAGE_KURZ[a.lage] || a.lage}` : ""}`)
          .join(" · ")}
      </span>
    );
  };

  const reportData = { regimens, checks, entries, photos, days: notes, members };

  return (
    <div className="stack">
      <Seg<Range>
        label="Zeitraum"
        value={range}
        onChange={setRange}
        options={[
          ...(start ? [["therapie", `ab ${fmtDM(start)}`] as [Range, string]] : []),
          ["7", "7 Tage"],
          ["14", "14 Tage"],
          ["30", "30 Tage"],
          ["alle", "Alles"],
        ]}
      />

      <div className="kpis">
        <div className="kpi">
          <div className="k">Atemzüge, Tageswert</div>
          <div className="v num">
            {lastAtem?.atemWert != null ? fmtNum(lastAtem.atemWert) : "–"}
            <small>/min</small>
          </div>
          <div className={`d${atemTrend != null ? (atemTrend < 0 ? " good" : atemTrend > 0 ? " bad" : "") : ""}`}>
            {atemTrend != null ? `${atemTrend > 0 ? "+" : ""}${fmtNum(atemTrend)} seit ${fmtDM(atemLine[0].day)}` : baseline ? `vor Therapie ${baseline.min}–${baseline.max}` : "noch keine Zählung"}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Gewicht</div>
          <div className="v num">
            {lastW ? fmtNum(lastW.value, 1) : "–"}
            <small>kg</small>
          </div>
          <div className="d">{lastW && firstW && lastW !== firstW ? `${lastW.value - firstW.value >= 0 ? "+" : ""}${fmtNum(lastW.value - firstW.value, 1)} kg seit ${fmtDM(firstW.day)}` : profile?.data?.weight_normal ? `früher ${profile.data.weight_normal}` : ""}</div>
        </div>
        <div className="kpi">
          <div className="k">Trinken, Ø pro Tag</div>
          <div className="v num">
            {fluidDays.length ? fmtNum(fluidDays.reduce((a, b) => a + b, 0) / fluidDays.length) : "–"}
            <small>ml</small>
          </div>
          <div className="d">{fluidDays.length ? `${fluidDays.length} ${fluidDays.length === 1 ? "Tag" : "Tage"} mit Angabe` : "keine Angaben"}</div>
        </div>
        <div className="kpi">
          <div className="k">Futter, Ø pro Tag</div>
          <div className="v num">
            {foodDays.length ? fmtNum(foodDays.reduce((a, b) => a + b, 0) / foodDays.length) : "–"}
            <small>g</small>
          </div>
          <div className="d">{foodDays.length ? `${foodDays.length} ${foodDays.length === 1 ? "Tag" : "Tage"} mit Angabe` : "keine Angaben"}</div>
        </div>
        <div className="kpi">
          <div className="k">SpO₂, niedrigster Wert</div>
          <div className="v num">
            {spoAll.length ? fmtNum(Math.min(...spoAll)) : "–"}
            <small>%</small>
          </div>
          <div className={`d${spoAll.length && Math.min(...spoAll) < 95 ? " bad" : ""}`}>{spoAll.length ? `${spoAll.length} ${spoAll.length === 1 ? "Messung" : "Messungen"}` : "keine Messung"}</div>
        </div>
        <div className="kpi">
          <div className="k">Plan eingehalten</div>
          <div className="v num">
            {planTotal ? Math.round((planDone / planTotal) * 100) : "–"}
            <small>%</small>
          </div>
          <div className="d">{planTotal ? `${planDone} von ${planTotal} fälligen Punkten` : "kein Plan im Zeitraum"}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Atemzüge pro Minute</div>
        {atemPoints.length || baseline ? (
          <>
            <PointsChart
              ariaLabel="Atemzüge pro Minute je Tag"
              days={days}
              points={atemPoints}
              line={atemLine}
              band={baseline ? { from: baseline.min, to: baseline.max, label: `vor Therapie ${baseline.min}–${baseline.max}` } : null}
              refLine={{ value: 40, label: "Ziel: unter 40" }}
              colors={{ schlaeft: "var(--s1)", ruhig: "var(--s2)" }}
              yMin={atemRange.min}
              yMax={atemRange.max}
              yStep={atemRange.max - atemRange.min > 60 ? 20 : 10}
              tipFor={atemTip}
              markers={markers}
            />
            <div className="legend">
              <span>
                <i style={{ background: "var(--s1)" }} />
                im Schlaf
              </span>
              <span>
                <i style={{ background: "var(--s2)" }} />
                wach, ruhig
              </span>
              <span>
                <i className="ring" />
                nach Bewegung
              </span>
              <span>
                <i className="line" style={{ background: "var(--ink-2)" }} />
                Tageswert (Median in Ruhe)
              </span>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Bei Hunden mit Herzklappenerkrankung gilt eine Schlafatemfrequenz über 40/min als Warnzeichen; gesunde Hunde liegen meist unter 30. Entscheidend ist vor allem die Richtung unter der Therapie.
            </p>
          </>
        ) : (
          <p className="hint">Noch keine Atemzählungen im Zeitraum. Unter Protokoll → Atemzüge zählen.</p>
        )}
      </div>

      {hasSides ? (
        <div className="card">
          <div className="card-title">Atemzüge nach Liegeseite</div>
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="data" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Lage</th>
                  <th>Median</th>
                  <th>Spanne</th>
                  <th>Messungen</th>
                </tr>
              </thead>
              <tbody>
                {bySide.map((g) => (
                  <tr key={g.k || "none"}>
                    <td>{g.label}</td>
                    <td>{fmtNum(g.med)}/min</td>
                    <td>
                      {fmtNum(g.min)}–{fmtNum(g.max)}
                    </td>
                    <td>{g.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Nur Messungen in Ruhe. Bei wenigen Werten sind Unterschiede zwischen den Seiten oft Zufall.
          </p>
        </div>
      ) : null}

      <div className="chart-pair">
        <div className="card">
          <div className="card-title">Trinken (ml pro Tag)</div>
          <BarsChart ariaLabel="Trinkmenge je Tag" days={days} values={fluids} color="var(--s1)" yMin={0} yMax={fluidMax.max} yStep={fluidMax.max > 600 ? 200 : 100} tipFor={(d) => {
            const s = stats[days.indexOf(d)];
            const f = fluidOfDay(s);
            return <span>{fmtDayShort(d)}: <b>{f.ml != null ? `${fmtNum(f.ml)} ml` : "–"}</b>{f.source === "papier" ? " (Papier)" : s.selbstMl ? ` · selbst ${fmtNum(s.selbstMl)} ml` : ""}</span>;
          }} />
        </div>

        <div className="card">
          <div className="card-title">Futter (g pro Tag)</div>
          <BarsChart ariaLabel="Futtermenge je Tag" days={days} values={foods} color="var(--s2)" yMin={0} yMax={foodMax.max} yStep={foodMax.max > 600 ? 200 : 100} tipFor={(d) => {
            const s = stats[days.indexOf(d)];
            const f = foodOfDay(s);
            return <span>{fmtDayShort(d)}: <b>{f.g != null ? `${fmtNum(f.g)} g` : "–"}</b>{s.futterOhneMenge.length ? ` + ${s.futterOhneMenge.join(", ")}` : ""}{s.schmerz ? ` · ${s.schmerz}× Schmerzreaktion` : ""}</span>;
          }} />
        </div>
      </div>

      <div className="chart-pair">
        <div className="card">
          <div className="card-title">SpO₂ (%)</div>
          {spoPoints.length ? (
            <PointsChart ariaLabel="Sauerstoffsättigung" days={days} points={spoPoints} colors={{ spo2: "var(--s1)" }} refLine={{ value: 95, label: "Ziel: ab 95 %" }} yMin={spoRange.min} yMax={spoRange.max} yStep={2} height={180} line={stats.filter((s) => s.spo2Min != null).map((s) => ({ day: s.day, value: median(s.spo2.map((x) => x.pct)) as number }))} tipFor={(d) => {
              const s = stats[days.indexOf(d)];
              return <span>{fmtDayShort(d)}: {s.spo2.length ? s.spo2.map((x) => `${x.time} ${fmtNum(x.pct)} %`).join(" · ") : "keine Messung"}</span>;
            }} />
          ) : (
            <p className="hint">Noch keine Messungen im Zeitraum.</p>
          )}
        </div>
        <div className="card">
          <div className="card-title">Gewicht (kg)</div>
          {weightPoints.length ? (
            <PointsChart ariaLabel="Gewicht" days={days} points={weightPoints} colors={{ kg: "var(--s1)" }} line={weights.map((w) => ({ day: w.day, value: w.value }))} yMin={weightRange.min} yMax={weightRange.max} yStep={weightRange.max - weightRange.min > 3 ? 1 : 0.5} fmt={(v) => fmtNum(v, v % 1 ? 1 : 0)} height={180} />
          ) : (
            <p className="hint">Noch kein Gewicht im Zeitraum.</p>
          )}
          {profile?.data?.weight_normal ? <p className="hint">Normalgewicht früher {profile.data.weight_normal}.</p> : null}
        </div>
      </div>

      <div className="section-title">
        <h2>Tage im Überblick</h2>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Atemzüge</th>
              <th>SpO₂ min</th>
              <th>kg</th>
              <th>Trinken</th>
              <th>Futter</th>
              <th>Kot</th>
              <th>Erbr.</th>
              <th>Husten</th>
              <th>Nacht</th>
            </tr>
          </thead>
          <tbody>
            {[...stats].reverse().map((s) => {
              const fl = fluidOfDay(s);
              const fo = foodOfDay(s);
              return (
                <tr key={s.day}>
                  <td>{fmtDayShort(s.day)}</td>
                  <td>{s.atemWert != null ? `${fmtNum(s.atemWert)} (${fmtNum(s.atemMin)}–${fmtNum(s.atemMax)})` : "–"}</td>
                  <td>{s.spo2Min != null ? `${fmtNum(s.spo2Min)} %` : "–"}</td>
                  <td>{s.kg != null ? fmtNum(s.kg, 1) : "–"}</td>
                  <td>{fl.ml != null ? `${fmtNum(fl.ml)} ml` : "–"}</td>
                  <td>{fo.g != null ? `${fmtNum(fo.g)} g` : s.futterN ? `${s.futterN}×` : "–"}</td>
                  <td>{s.kot ? `${s.kot}×${s.kotSchwarz ? " ⚑" : ""}` : "–"}</td>
                  <td>{s.erbrechen || "–"}</td>
                  <td>{s.husten || "–"}</td>
                  <td style={{ textAlign: "left" }}>{s.nacht || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="stack-s">
        <button className="btn primary" onClick={() => sheets.open((close) => <ReportSheet now={now} onClose={close} />)}>
          <Icon name="file" size={20} /> Bericht für die Klinik
        </button>
        <button className="btn claude" onClick={() => onAsk(`Bitte fasse die Entwicklung von Spotty vom ${fmtDayShort(from)} bis heute zusammen: Atmung, Sättigung, Gewicht, Trinken und Futter, Auffälligkeiten und Einhaltung des Plans. Was ist besser, was schlechter, was sollten wir mit der Klinik besprechen?`)}>
          <Icon name="claude" size={20} /> Entwicklung mit Claude auswerten
        </button>
        <div className="grid-2">
          <button
            className="btn ghost"
            onClick={async () => {
              const ok = await copyText(rangeText(reportData, from, now.day));
              toast.show(ok ? "Verlauf kopiert" : "Kopieren nicht möglich", { error: !ok });
            }}
          >
            <Icon name="copy" size={20} /> Als Text
          </button>
          <button className="btn ghost" onClick={() => downloadText(`Spotty_Verlauf_${from}_${now.day}.csv`, csv(reportData, from, now.day), "text/csv;charset=utf-8")}>
            <Icon name="download" size={20} /> Tabelle (CSV)
          </button>
        </div>
      </div>
    </div>
  );
}
