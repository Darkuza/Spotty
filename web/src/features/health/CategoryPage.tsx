// Kategorieseite wie „Bewegung“ oder „Herz und Lungen“ in Health: farbiger Kopf, Karten nach Aktualität,
// darunter die Messwerte ohne Daten als Liste.

import { useMemo } from "react";
import { addDays } from "@shared/dates.ts";
import { useNowValue } from "../../lib/now";
import { openSub } from "../../lib/route";
import { Group, NavBar, Row, Screen, SectionHead } from "../../ui/ios";
import { catColor, catOf, metricsOfCat, type CatId, type MetricDef } from "../../lib/health/metrics";
import { MetricCard } from "./cards";
import { seriesOf, useSources, type Series } from "./useHealth";

const GROUPS: [string, number][] = [
  ["Heute", 0],
  ["Letzte 7 Tage", 6],
  ["Letzte 30 Tage", 29],
  ["Letztes Jahr", 364],
  ["Über 1 Jahr", Infinity],
];

export function CategoryPage({ cat, back }: { cat: string; back: string }) {
  const def = catOf(cat);
  const src = useSources();
  const now = useNowValue();
  const list = useMemo(() => (def ? metricsOfCat(def.id as CatId).map((m) => ({ m, s: seriesOf(m, src) })) : []), [def, src]);
  if (!def) {
    return (
      <Screen>
        <NavBar title="Kategorie" back={back} />
        <p className="muted-c">Diese Kategorie gibt es nicht.</p>
      </Screen>
    );
  }
  const latestDay = (s: Series) => {
    let last: string | null = null;
    for (const d of s.days.keys()) if (d <= now.day && (!last || d > last)) last = d;
    return last;
  };
  const withData: { m: MetricDef; s: Series; day: string }[] = [];
  const without: MetricDef[] = [];
  for (const x of list) {
    const d = latestDay(x.s);
    if (d) withData.push({ ...x, day: d });
    else without.push(x.m);
  }
  withData.sort((a, b) => b.day.localeCompare(a.day));
  const groups = GROUPS.map(([label, back2], i) => {
    const prev = i ? GROUPS[i - 1][1] : -1;
    const lo = back2 === Infinity ? "0000-00-00" : addDays(now.day, -back2);
    const hi = prev < 0 ? now.day : addDays(now.day, -(prev + 1));
    return { label, items: withData.filter((x) => x.day >= lo && x.day <= hi) };
  }).filter((g) => g.items.length);

  return (
    <Screen tint={catColor(def.id)}>
      <NavBar title={def.label} large back={back} />
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <SectionHead title={g.label} />
          <div className="mcards">
            {g.items.map(({ m, s }) => (
              <MetricCard key={m.id} def={m} series={s} onClick={() => openSub(`m/${m.id}`)} />
            ))}
          </div>
        </section>
      ))}
      {without.length ? (
        <section aria-label="Keine Daten verfügbar">
          <SectionHead title="Keine Daten verfügbar" />
          <Group>
            {without.map((m) => (
              <Row key={m.id} title={m.label} chevron onClick={() => openSub(`m/${m.id}`)} />
            ))}
          </Group>
        </section>
      ) : null}
    </Screen>
  );
}
