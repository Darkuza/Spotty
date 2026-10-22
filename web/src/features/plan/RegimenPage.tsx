// Ein Mittel des Plans: heutige Dosis, Uhrzeiten, Stufenplan, Vorrat, Verlauf der letzten 14 Tage, Hinweise.
// Die Abschnitte stehen auch auf der Wirkstoffseite (Medikamente) und sind deshalb als eigener Baustein herausgelöst.

import { useMemo, useState, type CSSProperties } from "react";
import { useChecks, useRegimens } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { useAsk } from "../../lib/ask";
import { useSheets } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { CircleButton, Group, NavBar, Row, Screen, SectionHead } from "../../ui/ios";
import { fmtAmount, stepFor, phases, itemsForDay } from "@shared/plan.ts";
import { addDays, dayRange } from "@shared/dates.ts";
import { WD_SHORT } from "@shared/dates.ts";
import { gapRules, fmtDuration } from "../../lib/gaps";
import { fmtDate, fmtDayMonthShort } from "../../lib/health/format";
import { CAT_LABEL } from "../../ui/kinds";
import { RegimenSheet } from "../settings/PlanEditor";
import type { Regimen } from "@shared/types.ts";
import { regimenStyle } from "./planStyle";
import { stockText } from "./MedsPage";

const HISTORY_COMPACT = 7;

export function RegimenPage({ id, back }: { id: string; back: string }) {
  const regimens = useRegimens();
  const sheets = useSheets();
  const ask = useAsk();
  const r = regimens.find((x) => x.id === id);
  if (!r) {
    return (
      <Screen>
        <NavBar title="Medikament" back={back} />
        <p className="muted-c">Dieses Mittel gibt es nicht mehr im Plan.</p>
      </Screen>
    );
  }
  const st = regimenStyle(r);
  return (
    <Screen>
      <NavBar title={r.name} back={back} trailing={<CircleButton icon="edit" label="Bearbeiten" onClick={() => sheets.open((close) => <RegimenSheet regimen={r} onClose={close} />)} />} />
      <div className="reg-head" style={{ "--cat": st.color } as CSSProperties}>
        <span className="reg-ic" aria-hidden="true">
          <Glyph name={st.glyph} size={44} />
        </span>
        <h1 className="lt center">{r.name}</h1>
        <p className="reg-sub">{[CAT_LABEL[r.category], r.purpose].filter(Boolean).join(" · ")}</p>
      </div>

      <RegimenSections r={r} />

      <Group>
        <Row glyph="chat" color="var(--claude)" title="Mit Claude besprechen" onClick={() => ask(`Bitte erkläre mir ${r.name}${r.purpose ? ` (${r.purpose})` : ""} im Plan von Spotty: wozu, worauf achten, was bei vergessenen oder erbrochenen Gaben zu tun ist. Dosierungen ändert nur die Klinik.`)} />
      </Group>
    </Screen>
  );
}

/**
 * Abschnitte eines Plans: Heute, Hinweise, Stufenplan, Abstandsregeln, letzte 14 Tage.
 * `compact` lässt Dosis, Uhrzeiten und Rhythmus weg (die Wirkstoffseite zeigt sie größer) und nennt den ersten Block „Plan“.
 */
export function RegimenSections({ r, compact = false }: { r: Regimen; compact?: boolean }) {
  const regimens = useRegimens();
  const checks = useChecks();
  const now = useNowValue();
  const [allDays, setAllDays] = useState(false);
  const history = useMemo(() => {
    return dayRange(addDays(now.day, -13), now.day)
      .reverse()
      .map((d) => {
        const its = itemsForDay([r], d);
        const cs = its.map((it) => checks.find((c) => c.day === d && c.slot === it.slot) || null);
        return { day: d, its, cs };
      })
      .filter((x) => x.its.length);
  }, [r, checks, now.day]);
  const cur = stepFor(r, now.day);
  const ph = phases(r, now.day);
  const rules = gapRules(regimens).filter((g) => g.regimenId === r.id || g.others.includes(r.id));
  const stock = stockText(r);
  // Auf der Wirkstoffseite zeigt der Verlauf zunächst die letzten sieben Tage.
  const shownDays = compact && !allDays ? history.slice(0, HISTORY_COMPACT) : history;
  const pattern = (s: (typeof r.steps)[number]) => (s.pattern === "alternate" ? "jeden zweiten Tag" : s.pattern === "weekdays" ? (s.weekdays || []).map((w) => WD_SHORT[w]).join(", ") : "täglich");
  // Hinweis zur Dosis, z. B. „¾ Tablette“; steht dort nur der Rhythmus, wird er nicht doppelt gezeigt
  const hint = (s: (typeof r.steps)[number]) => (s.label && !s.label.startsWith(pattern(s)) ? s.label : "");
  return (
    <>
      <Group header={compact ? "Plan" : "Heute"}>
        {compact ? null : <Row title="Dosis" sub={cur ? hint(cur) || undefined : undefined} value={cur ? cur.dose || "laut Plan" : r.active ? "heute nicht geplant" : "pausiert"} />}
        {compact ? null : <Row title="Uhrzeiten" value={(r.slots || []).map((s) => s.time).join(", ") || "–"} />}
        {compact || !cur ? null : <Row title="Rhythmus" value={(cur.label || "").startsWith(pattern(cur)) ? cur.label : pattern(cur)} wrap />}
        {stock ? <Row title="Vorrat" value={stock.replace(/^Vorrat /, "")} /> : r.stock != null ? <Row title="Vorrat" value={`${fmtAmount(Number(r.stock))} ${r.unit || ""}`.trim()} /> : null}
        <Row title="Erinnerung" value={r.notify === false ? "aus" : "an"} />
      </Group>

      {r.instructions || r.note ? (
        <Group header="Hinweise">
          {r.instructions ? <Row title={r.instructions} wrap /> : null}
          {r.note ? <Row title={r.note} wrap /> : null}
        </Group>
      ) : null}

      {ph.length > 1 || (ph.length === 1 && ph[0].step.to) ? (
        <Group header="Stufenplan">
          {ph.map((p) => (
            <Row
              key={p.index}
              title={p.step.dose || "laut Plan"}
              sub={[p.step.label || "", (p.step.label || "").startsWith(pattern(p.step)) ? "" : pattern(p.step), `${fmtDate(p.step.from)}${p.step.to ? ` bis ${fmtDate(p.step.to)}` : " ohne Ende"}`].filter(Boolean).join(" · ")}
              wrap
              accessory={p.current ? <span className="tagc">aktuell</span> : p.past ? <span className="tagc gray">vorbei</span> : null}
            />
          ))}
        </Group>
      ) : null}

      {rules.length ? (
        <Group header="Abstandsregeln">
          {rules.map((g, i) => {
            const a = regimens.find((x) => x.id === g.regimenId)?.name || "";
            const others = g.others.map((o) => regimens.find((x) => x.id === o)?.name).filter(Boolean);
            return <Row key={i} glyph="clock" color="var(--orange)" title={`${a}: ${fmtDuration(g.minutes)} Abstand zu ${others.join(" und ")}`} wrap />;
          })}
        </Group>
      ) : null}

      {history.length && r.category !== "mess" && r.category !== "foto" ? (
        <section aria-label="Verlauf">
          {compact ? null : <SectionHead title="Letzte 14 Tage" />}
          <Group header={compact ? "Letzte 14 Tage" : undefined}>
            {shownDays.map(({ day, its, cs }) => {
              // fällig: Uhrzeit vorbei oder schon erledigt (auch vorzeitig), damit nie „2/1“ dasteht
              const isDue = its.map((it, i) => day < now.day || it.time <= now.hm || !!cs[i]);
              const given = cs.filter((c, i) => isDue[i] && c && !c.skipped).length;
              const skipped = cs.filter((c) => c && c.skipped).length;
              const due = isDue.filter(Boolean).length;
              return (
                <Row
                  key={day}
                  title={day === now.day ? "Heute" : fmtDayMonthShort(day)}
                  sub={cs.map((c, i) => `${its[i].time} ${c ? (c.skipped ? "ausgelassen" : `✓ ${c.time}`) : day < now.day || its[i].time <= now.hm ? "offen" : "geplant"}`).join(" · ")}
                  value={due ? `${given}/${due}` : "–"}
                  accessory={skipped ? <span className="tagc gray">{skipped} ausgelassen</span> : null}
                />
              );
            })}
            {compact && history.length > HISTORY_COMPACT ? <Row title={allDays ? "Weniger anzeigen" : `Alle ${history.length} Tage anzeigen`} tone="blue" onClick={() => setAllDays(!allDays)} /> : null}
          </Group>
        </section>
      ) : null}
    </>
  );
}
