// Tage im Überblick: eine Zeile je Tag mit den wichtigsten Werten, dazu Kopieren und Tabelle (CSV).
// Ersetzt die Tagestabelle des früheren Reiters „Verlauf“.

import { useMemo, useState } from "react";
import { useChecks, useDayNotes, useEntries, usePhotos, useRegimens } from "../../lib/data";
import { useMembers } from "../../lib/session";
import { useNowValue } from "../../lib/now";
import { useAsk } from "../../lib/ask";
import { copyText, downloadText } from "../../lib/files";
import { csv, rangeText } from "../../lib/report";
import { useToast } from "../../ui/overlays";
import { Group, NavBar, Row, Screen } from "../../ui/ios";
import { Icon } from "../../ui/Icon";
import { addDays, dayRange, fmtDayShort } from "@shared/dates.ts";
import { fmtNum } from "@shared/entryTypes.ts";
import { dayStats, fluidOfDay, foodOfDay } from "@shared/stats.ts";
import { therapyStart } from "@shared/plan.ts";

type Range = "therapie" | "7" | "14" | "30" | "alle";

export function TablePage({ back }: { back: string }) {
  const entries = useEntries();
  const notes = useDayNotes();
  const regimens = useRegimens();
  const checks = useChecks();
  const photos = usePhotos();
  const members = useMembers();
  const now = useNowValue();
  const toast = useToast();
  const ask = useAsk();
  const start = useMemo(() => therapyStart(regimens), [regimens]);
  const [range, setRange] = useState<Range>(start && start <= now.day ? "therapie" : "14");
  const firstDay = useMemo(() => entries.map((e) => e.day).sort()[0] || now.day, [entries, now.day]);
  const from = range === "therapie" && start && start <= now.day ? start : range === "alle" ? firstDay : range === "therapie" ? addDays(now.day, -6) : addDays(now.day, -(parseInt(range, 10) - 1));
  const stats = useMemo(() => dayRange(from, now.day).map((d) => dayStats(entries, d, notes.find((n) => n.day === d) || null)), [from, now.day, entries, notes]);
  const report = { regimens, checks, entries, photos, days: notes, members };
  const options: [Range, string][] = [...(start && start <= now.day ? [["therapie", "seit Therapiebeginn"] as [Range, string]] : []), ["7", "7 Tage"], ["14", "14 Tage"], ["30", "30 Tage"], ["alle", "alle Tage"]];

  return (
    <Screen>
      <NavBar title="Tage im Überblick" large back={back} />
      <Group>
        <Row
          title="Zeitraum"
          accessory={
            <span className="row-select-w">
              <select className="row-select" value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="Zeitraum">
                {options.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <Icon name="updown" size={15} stroke={2.4} />
            </span>
          }
        />
      </Group>
      <div className="table-wrap tbl-card" role="region" aria-label="Tage im Überblick" tabIndex={0}>
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
                  <td>{fl.ml != null ? `${fmtNum(fl.ml)} ml${fl.source === "papier" ? " (P)" : ""}` : "–"}</td>
                  <td>{fo.g != null ? `${fmtNum(fo.g)} g${fo.source === "papier" ? " (P)" : ""}` : s.futterN ? `${s.futterN}×` : "–"}</td>
                  <td>{s.kot ? `${s.kot}×${s.kotSchwarz ? ", schwarz" : ""}` : "–"}</td>
                  <td>{s.erbrechen || "–"}</td>
                  <td>{s.husten || "–"}</td>
                  <td>{s.nacht || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="grp-f">Atemzüge: Median in Ruhe, dahinter der Bereich. (P) = Tagessumme vom Papierprotokoll.</p>
      <Group header="Teilen">
        <Row
          icon="copy"
          color="var(--blue)"
          title="Als Text kopieren"
          tone="blue"
          onClick={async () => {
            const ok = await copyText(rangeText(report, from, now.day));
            toast.show(ok ? "Verlauf kopiert" : "Kopieren nicht möglich", { error: !ok });
          }}
        />
        <Row icon="download" color="var(--blue)" title="Als Tabelle laden (CSV)" tone="blue" onClick={() => downloadText(`Spotty_Verlauf_${from}_${now.day}.csv`, csv(report, from, now.day), "text/csv;charset=utf-8")} />
      </Group>
      <Group>
        <Row
          glyph="chat"
          color="var(--claude)"
          title="Entwicklung mit Claude auswerten"
          onClick={() => ask(`Bitte fasse die Entwicklung von Spotty vom ${fmtDayShort(from)} bis heute zusammen: Atmung, Sättigung, Gewicht, Trinken und Futter, Auffälligkeiten und Einhaltung des Plans. Was ist besser, was schlechter, was sollten wir mit der Klinik besprechen?`)}
        />
      </Group>
    </Screen>
  );
}
