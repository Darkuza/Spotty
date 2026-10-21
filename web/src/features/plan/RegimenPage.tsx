// Ein Mittel des Plans: heutige Dosis, Uhrzeiten, Stufenplan, Vorrat, Verlauf der letzten 14 Tage, Hinweise.

import { useMemo, type CSSProperties } from "react";
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
import { regimenStyle } from "./planStyle";
import { stockText } from "./MedsPage";

export function RegimenPage({ id, back }: { id: string; back: string }) {
  const regimens = useRegimens();
  const checks = useChecks();
  const now = useNowValue();
  const sheets = useSheets();
  const ask = useAsk();
  const r = regimens.find((x) => x.id === id);
  const history = useMemo(() => {
    if (!r) return [];
    return dayRange(addDays(now.day, -13), now.day)
      .reverse()
      .map((d) => {
        const its = itemsForDay([r], d);
        const cs = its.map((it) => checks.find((c) => c.day === d && c.slot === it.slot) || null);
        return { day: d, its, cs };
      })
      .filter((x) => x.its.length);
  }, [r, checks, now.day]);
  if (!r) {
    return (
      <Screen>
        <NavBar title="Medikament" back={back} />
        <p className="muted-c">Dieses Mittel gibt es nicht mehr im Plan.</p>
      </Screen>
    );
  }
  const st = regimenStyle(r);
  const cur = stepFor(r, now.day);
  const ph = phases(r, now.day);
  const rules = gapRules(regimens).filter((g) => g.regimenId === r.id || g.others.includes(r.id));
  const stock = stockText(r);
  const pattern = (s: (typeof r.steps)[number]) => (s.pattern === "alternate" ? "jeden zweiten Tag" : s.pattern === "weekdays" ? (s.weekdays || []).map((w) => WD_SHORT[w]).join(", ") : "täglich");
  // Hinweis zur Dosis, z. B. „¾ Tablette“; steht dort nur der Rhythmus, wird er nicht doppelt gezeigt
  const hint = (s: (typeof r.steps)[number]) => (s.label && !s.label.startsWith(pattern(s)) ? s.label : "");
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

      <Group header="Heute">
        <Row title="Dosis" sub={cur ? hint(cur) || undefined : undefined} value={cur ? cur.dose || "laut Plan" : r.active ? "heute nicht geplant" : "pausiert"} />
        <Row title="Uhrzeiten" value={(r.slots || []).map((s) => s.time).join(", ") || "–"} />
        {cur ? <Row title="Rhythmus" value={(cur.label || "").startsWith(pattern(cur)) ? cur.label : pattern(cur)} wrap /> : null}
        {stock ? <Row title="Vorrat" value={stock} /> : r.stock != null ? <Row title="Vorrat" value={`${fmtAmount(Number(r.stock))} ${r.unit || ""}`.trim()} /> : null}
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
          <SectionHead title="Letzte 14 Tage" />
          <Group>
            {history.map(({ day, its, cs }) => {
              const given = cs.filter((c) => c && !c.skipped).length;
              const skipped = cs.filter((c) => c && c.skipped).length;
              const due = day < now.day ? its.length : its.filter((it) => it.time <= now.hm).length;
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
          </Group>
        </section>
      ) : null}

      <Group>
        <Row glyph="chat" color="var(--claude)" title="Mit Claude besprechen" onClick={() => ask(`Bitte erkläre mir ${r.name}${r.purpose ? ` (${r.purpose})` : ""} im Plan von Spotty: wozu, worauf achten, was bei vergessenen oder erbrochenen Gaben zu tun ist. Dosierungen ändert nur die Klinik.`)} />
      </Group>
    </Screen>
  );
}
