// Listen der Übersicht: Alle Daten, Trends, Highlights und Familie.

import { useMemo } from "react";
import { useEntries, usePhotos } from "../../lib/data";
import { useMe, useMembers } from "../../lib/session";
import { useNowValue } from "../../lib/now";
import { openSub } from "../../lib/route";
import { useSheets } from "../../ui/overlays";
import { EmptyCard, Group, NavBar, Row, Screen } from "../../ui/ios";
import { addDays } from "@shared/dates.ts";
import { METRICS, catColor, metricOf } from "../../lib/health/metrics";
import { highlightsOf, trendsOf, TREND_METRICS } from "../../lib/health/highlights";
import { fmtWhen, plural } from "../../lib/health/format";
import { MembersSheet } from "../settings/MembersSheet";
import { ReportSheet } from "../stats/ReportSheet";
import { HighlightCard, latestOf } from "./cards";
import { seriesOf, useSources } from "./useHealth";

export function AllDataPage({ back }: { back: string }) {
  const src = useSources();
  const now = useNowValue();
  const sheets = useSheets();
  const rows = useMemo(
    () =>
      [...METRICS]
        .sort((a, b) => a.label.localeCompare(b.label, "de"))
        .map((m) => ({ m, latest: latestOf(m, seriesOf(m, src), now.day) })),
    [src, now.day],
  );
  const withData = rows.filter((r) => r.latest);
  const without = rows.filter((r) => !r.latest);
  return (
    <Screen>
      <NavBar title="Alle Daten" back={back} />
      <h1 className="lt">Alle Daten</h1>
      <Group>
        {withData.map(({ m, latest }) => (
          <Row key={m.id} glyph={m.glyph} color={catColor(m.cat)} title={m.label} sub={latest ? `${latest.value} ${latest.unit}`.trim() : undefined} value={latest ? fmtWhen(latest.day, latest.time, now.day) : undefined} chevron onClick={() => openSub(m.id === "plan" ? "tagesplan" : `m/${m.id}`)} />
        ))}
      </Group>
      <Group header="Auswerten und teilen">
        <Row glyph="calendar" color="var(--blue)" title="Tage im Überblick" sub="Tabelle, als Text oder CSV" chevron onClick={() => openSub("tabelle")} />
        <Row glyph="doc" color="var(--blue)" title="Bericht für die Klinik" chevron onClick={() => sheets.open((close) => <ReportSheet now={now} onClose={close} />)} />
      </Group>
      {without.length ? (
        <Group header="Keine Daten verfügbar">
          {without.map(({ m }) => (
            <Row key={m.id} glyph={m.glyph} color={catColor(m.cat)} title={m.label} chevron onClick={() => openSub(`m/${m.id}`)} />
          ))}
        </Group>
      ) : null}
    </Screen>
  );
}

export function TrendsPage({ back }: { back: string }) {
  const src = useSources();
  const now = useNowValue();
  const { items, enough } = useMemo(() => trendsOf(src, now.day), [src, now.day]);
  const stable = TREND_METRICS.filter((id) => !items.some((t) => t.metric === id));
  return (
    <Screen>
      <NavBar title="Trends" back={back} />
      <h1 className="lt">Trends</h1>
      <p className="lead-c">Verglichen werden die letzten 7 abgeschlossenen Tage mit den 7 Tagen davor. Ein Trend erscheint, wenn sich der Wert deutlich ändert und an mindestens 4 Tagen je Woche Angaben vorliegen.</p>
      {!enough ? (
        <EmptyCard title="Noch nicht genug Daten">Für Trends braucht es zwei Wochen mit Einträgen. Bis dahin zeigen die Messwertseiten den Verlauf im Diagramm.</EmptyCard>
      ) : (
        <>
          {items.length ? (
            <Group header="Veränderungen">
              {items.map((t) => {
                const m = metricOf(t.metric)!;
                return <Row key={t.metric} glyph={m.glyph} color={catColor(m.cat)} title={`${m.label}: ${t.dir === "up" ? "steigend" : "sinkend"}`} sub={t.text} wrap chevron onClick={() => openSub(`m/${m.id}`)} />;
              })}
            </Group>
          ) : (
            <EmptyCard title="Keine deutlichen Veränderungen">In den letzten zwei Wochen ist kein Wert deutlich gestiegen oder gesunken.</EmptyCard>
          )}
          <Group header="Ohne deutliche Veränderung oder mit zu wenig Daten">
            {stable.map((id) => {
              const m = metricOf(id)!;
              return <Row key={id} glyph={m.glyph} color={catColor(m.cat)} title={m.label} chevron onClick={() => openSub(`m/${m.id}`)} />;
            })}
          </Group>
        </>
      )}
    </Screen>
  );
}

export function HighlightsPage({ back }: { back: string }) {
  const src = useSources();
  const now = useNowValue();
  const list = useMemo(() => highlightsOf(src, now), [src, now]);
  return (
    <Screen>
      <NavBar title="Highlights" back={back} />
      <h1 className="lt">Highlights</h1>
      {list.length ? (
        <div className="mcards">
          {list.map((h) => (
            <HighlightCard key={h.id} hl={h} onClick={() => openSub(h.metric === "plan" ? "tagesplan" : `m/${h.metric}`)} />
          ))}
        </div>
      ) : (
        <EmptyCard title="Noch keine Highlights">Highlights erscheinen, sobald es für ein paar Tage Einträge gibt, etwa zum Trinken, zum Futter oder zu den Atemzügen.</EmptyCard>
      )}
    </Screen>
  );
}

/** Familie: wer mitmacht und wer in den letzten 7 Tagen was eingetragen hat. */
export function FamilyPage({ back }: { back: string }) {
  const members = useMembers();
  const me = useMe();
  const entries = useEntries();
  const photos = usePhotos();
  const now = useNowValue();
  const sheets = useSheets();
  const from = addDays(now.day, -6);
  const stats = useMemo(() => {
    const m = new Map<string, { n: number; last: string }>();
    for (const e of entries) {
      if (!e.created_by || e.day < from || e.source === "import") continue;
      const c = m.get(e.created_by) || { n: 0, last: "" };
      c.n++;
      const k = `${e.day} ${e.time}`;
      if (k > c.last) c.last = k;
      m.set(e.created_by, c);
    }
    for (const p of photos) {
      if (!p.created_by || p.day < from) continue;
      const c = m.get(p.created_by) || { n: 0, last: "" };
      c.n++;
      m.set(p.created_by, c);
    }
    return m;
  }, [entries, photos, from]);
  return (
    <Screen>
      <NavBar title="Familie" back={back} />
      <h1 className="lt">Familie und Einträge</h1>
      <Group header="Mitglieder" footer="Alle sehen dieselben Daten. Gespräche mit Claude sieht jede Person nur selbst.">
        {members.map((mb) => {
          const st = stats.get(mb.user_id);
          return <Row key={mb.user_id} glyph="person" color="var(--blue)" title={`${mb.name}${mb.user_id === me?.user_id ? " (du)" : ""}`} sub={`${mb.role === "admin" ? "Admin" : "Mitglied"}${st?.last ? ` · zuletzt ${fmtWhen(st.last.slice(0, 10), st.last.slice(11), now.day)}` : ""}`} value={st ? plural(st.n, "Eintrag", "Einträge") : "–"} />;
        })}
      </Group>
      <Group>
        <Row title="Tagesprotokoll ansehen" chevron onClick={() => openSub("protokoll")} />
        {me?.role === "admin" ? <Row title="Mitglieder verwalten" chevron onClick={() => sheets.open((close) => <MembersSheet onClose={close} />)} /> : null}
      </Group>
      <p className="lead-c small">Gezählt werden Einträge und Fotos der letzten 7 Tage; aus der Akte übernommene Einträge zählen nicht.</p>
    </Screen>
  );
}
