// Medikamente wie in Health: Tagesplan je Uhrzeit mit „Protokollieren“, deine Medikamente mit Stufenplan
// und Vorrat, Messungen, Abstandsregeln (statt Wechselwirkungen) und pausierte Mittel.

import { useMemo, useState, type CSSProperties } from "react";
import { useChecks, useEntries, usePhotos, usePlan, useRegimens, uncheckItem } from "../../lib/data";
import { useNameOf } from "../../lib/session";
import { useNowValue } from "../../lib/now";
import { openSub } from "../../lib/route";
import { Sheet, useConfirm, useSheets } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { CircleButton, DayStepper, EmptyCard, Group, NavBar, Pill, Row, Screen, SectionHead } from "../../ui/ios";
import { itemState, stepFor, stockProjection, nextChange, therapyStart, type ItemState } from "@shared/plan.ts";
import { addDays, daysBetween, minutesOf } from "@shared/dates.ts";
import { summarize } from "@shared/entryTypes.ts";
import type { Check, Entry, EntryType, PlanItem, Regimen } from "@shared/types.ts";
import { gapConflicts, gapRules, fmtDuration } from "../../lib/gaps";
import { catColor } from "../../lib/health/metrics";
import { fmtDayMonthShort, fmtDateWd } from "../../lib/health/format";
import { EntrySheet } from "../entry/EntrySheet";
import { PlanSheet } from "../settings/PlanEditor";
import { PushPanel } from "../settings/PushPanel";
import { CheckSheet, StartSheet, doneLabel } from "./actions";
import { SlotSheet } from "./SlotSheet";
import { itemColor, itemGlyph, regimenStyle } from "./planStyle";

function berlinOfIso(iso: string): { day: string; minutes: number } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { day, minutes: minutesOf(hm) };
}

/** Wie lange reicht der Vorrat? */
export function stockText(r: Regimen): string | null {
  if (r.stock == null || !r.stock_at) return null;
  const at = berlinOfIso(r.stock_at);
  const pr = stockProjection(r, Number(r.stock), at.day, at.minutes);
  if (pr.runsOut) return `Vorrat reicht bis ${fmtDayMonthShort(pr.lastCovered?.day || at.day)}`;
  return pr.end ? "Vorrat reicht bis Planende" : null;
}

export function MedsPage({ back }: { back: string }) {
  const now = useNowValue();
  const [day, setDay] = useState(now.day);
  const items = usePlan(day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const regimens = useRegimens();
  const nameOf = useNameOf();
  const sheets = useSheets();
  const confirm = useConfirm();
  const states = useMemo(() => items.map((it) => itemState(it, day, checks, entries, photos)), [items, day, checks, entries, photos]);
  const conflicts = useMemo(() => gapConflicts(regimens, items, day, checks), [regimens, items, day, checks]);
  const rules = useMemo(() => gapRules(regimens), [regimens]);
  const slots = useMemo(() => {
    const m = new Map<string, { it: PlanItem; st: ItemState }[]>();
    items.forEach((it, i) => {
      if (!m.has(it.time)) m.set(it.time, []);
      m.get(it.time)!.push({ it, st: states[i] });
    });
    return [...m.entries()];
  }, [items, states]);
  const start = therapyStart(regimens);
  const planned = regimens.filter((r) => r.active && r.category !== "mess" && r.category !== "foto" && (r.steps || []).length).sort((a, b) => a.sort - b.sort);
  const meds = planned.filter((r) => r.category === "med" || r.category === "inh");
  const care = planned.filter((r) => r.category !== "med" && r.category !== "inh");
  const careTitle = care.every((r) => r.category === "feed") ? "Fütterung" : care.some((r) => r.category === "feed") ? "Fütterung und Pflege" : "Pflege";
  const measures = regimens.filter((r) => r.active && (r.category === "mess" || r.category === "foto") && (r.steps || []).length).sort((a, b) => a.sort - b.sort);
  const waiting = regimens.filter((r) => r.active && (r.category === "med" || r.category === "inh") && !(r.steps || []).length).sort((a, b) => a.sort - b.sort);
  const paused = regimens.filter((r) => !r.active).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const label = day === now.day ? "Heute" : day === addDays(now.day, -1) ? "Gestern" : day === addDays(now.day, 1) ? "Morgen" : fmtDateWd(day);
  const done = states.filter((s) => s.done).length;

  const openItem = (it: PlanItem, st: ItemState) => {
    if (st.done && it.kind === "check") {
      const c = st.ref as Check;
      sheets.open((close) => (
        <CheckSheet
          item={it}
          check={c}
          by={nameOf(c.created_by)}
          onClose={close}
          onRemove={async () => {
            if (await confirm({ title: "Häkchen entfernen?", text: `${it.title} gilt dann wieder als offen.`, confirm: "Entfernen", danger: true })) {
              uncheckItem(day, it.slot);
              close();
            }
          }}
        />
      ));
      return;
    }
    if (it.kind === "mess" && !(st.done && st.skipped)) {
      sheets.open((close) => <EntrySheet type={(it.measure || "atem") as EntryType} day={day} slot={it.slot} entry={st.done ? (st.ref as Entry) : null} startCounter={it.measure === "atem" && !st.done} onClose={close} />);
      return;
    }
    sheets.open((close) => <SlotSheet day={day} time={it.time} onClose={close} />);
  };

  return (
    <Screen tint={catColor("medikamente")}>
      <NavBar title="Medikamente" large back={back} trailing={<CircleButton icon="edit" label="Plan bearbeiten" onClick={() => sheets.open((close) => <PlanSheet onClose={close} />)} />} />
      <div className="sh">
        <h2>{label}</h2>
        <span className="sh-sub">{items.length ? `${done} von ${items.length}` : ""}</span>
      </div>
      <DayStepper day={day} today={now.day} onChange={setDay} label={label === "Heute" ? `Heute, ${fmtDayMonthShort(day)}` : label} />
      {start && day >= start ? <p className="lead-c">Behandlungstag {daysBetween(start, day) + 1}</p> : null}
      {!items.length ? <EmptyCard title="Für diesen Tag ist nichts geplant">Der Plan kommt mit dem Import der Akte oder wird mit dem Stift oben rechts angelegt.</EmptyCard> : null}
      <div className="slots">
        {slots.map(([time, list]) => {
          const open = list.filter((x) => !x.st.done);
          const isPast = day < now.day || (day === now.day && minutesOf(time) <= now.minutes + 10);
          return (
            <section key={time} className="grp slot" aria-label={`${time} Uhr`}>
              <div className="grp-c">
                <div className="slot-head">
                  <span className="slot-time">{time}</span>
                  <span className="slot-st">{open.length ? (isPast && day <= now.day ? `${open.length} offen` : "Geplant") : "Erledigt"}</span>
                  {open.length ? (
                    <Pill kind={isPast ? "fill" : "tint"} onClick={() => sheets.open((close) => <SlotSheet day={day} time={time} onClose={close} />)}>
                      Protokollieren
                    </Pill>
                  ) : (
                    <span className="slot-ok" aria-label="erledigt">
                      <Glyph name="checklist" size={26} />
                    </span>
                  )}
                </div>
                {list.map(({ it, st }) => {
                  const cf = conflicts.filter((c) => c.slot === it.slot);
                  const who = st.done ? nameOf(st.by) : "";
                  const sub = st.done
                    ? `${st.skipped ? "Ausgelassen" : it.kind === "mess" ? summarize(st.ref as Entry) : it.kind === "foto" ? "Foto aufgenommen" : doneLabel(it)} · ${st.at}${who ? ` · ${who}` : ""}`
                    : it.detail || (it.kind === "mess" ? "Noch nicht eingetragen" : "Offen");
                  return (
                    <button key={it.slot} type="button" className={`lrow slot-row${st.done ? (st.skipped ? " skipped" : " done") : ""}`} onClick={() => openItem(it, st)} style={{ "--cat": itemColor(it) } as CSSProperties}>
                      <span className="row-ic" aria-hidden="true">
                        <Glyph name={itemGlyph(it)} size={24} />
                      </span>
                      <span className="row-t">
                        <span className="row-title">{it.title}</span>
                        <span className="row-sub">{sub}</span>
                        {cf.length ? (
                          <span className="row-warn">
                            {cf
                              .sort((a, b) => a.diff - b.diff)
                              .map((c) => `${fmtDuration(c.diff)} ${c.after ? "nach" : "vor"} ${c.otherName}`)
                              .join(", ")}
                            . Laut Plan {fmtDuration(cf[0].minutes)} Abstand.
                          </span>
                        ) : null}
                      </span>
                      <span className={`slot-mark${st.done ? (st.skipped ? " skip" : " on") : ""}`} aria-hidden="true">
                        {st.done ? st.skipped ? <span className="dash" /> : <Glyph name="checklist" size={22} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {waiting.length ? (
        <section aria-label="Noch nicht begonnen">
          <SectionHead title="Noch nicht begonnen" />
          <Group>
            {waiting.map((r) => {
              const st = regimenStyle(r);
              return <Row key={r.id} glyph={st.glyph} color={st.color} title={r.name} sub={`geplant ${(r.slots || []).map((s) => s.time).join(", ") || "ohne Uhrzeit"}`} accessory={<Pill onClick={() => sheets.open((close) => <StartSheet regimen={r} onClose={close} />)}>Beginnen</Pill>} />;
            })}
          </Group>
        </section>
      ) : null}

      {meds.length ? (
        <section aria-label="Deine Medikamente">
          <SectionHead title="Deine Medikamente" />
          <Group>
            {meds.map((r) => (
              <RegimenRow key={r.id} r={r} today={now.day} />
            ))}
          </Group>
        </section>
      ) : null}

      {care.length ? (
        <section aria-label={careTitle}>
          <SectionHead title={careTitle} />
          <Group>
            {care.map((r) => (
              <RegimenRow key={r.id} r={r} today={now.day} />
            ))}
          </Group>
        </section>
      ) : null}

      {measures.length ? (
        <section aria-label="Messungen">
          <SectionHead title="Messungen und Protokoll" />
          <Group>
            {measures.map((r) => {
              const st = regimenStyle(r);
              return <Row key={r.id} glyph={st.glyph} color={st.color} title={r.name} sub={(r.slots || []).map((s) => `${s.time}${s.label ? ` ${s.label}` : ""}`).join(" · ")} chevron onClick={() => openSub(r.category === "foto" ? "m/fotos" : `m/${r.measure || "atem"}`)} />;
            })}
          </Group>
        </section>
      ) : null}

      {rules.length ? (
        <section aria-label="Abstandsregeln">
          <SectionHead title="Abstandsregeln" />
          <Group footer="Gelesen aus den Anleitungen im Plan, etwa „2 h Abstand zu …“. Liegen zwei Gaben näher beieinander, steht ein Hinweis am Punkt.">
            {rules.map((ru, i) => {
              const r = regimens.find((x) => x.id === ru.regimenId);
              const others = ru.others.map((o) => regimens.find((x) => x.id === o)?.name).filter(Boolean);
              return <Row key={i} glyph="clock" color="var(--orange)" title={r?.name || ""} sub={`${fmtDuration(ru.minutes)} Abstand zu ${others.join(" und ")}`} wrap />;
            })}
          </Group>
        </section>
      ) : null}

      {paused.length ? (
        <section aria-label="Pausiert">
          <SectionHead title="Pausiert" />
          <Group>
            {paused.map((r) => {
              const st = regimenStyle(r);
              return <Row key={r.id} glyph={st.glyph} color="var(--label-3)" title={r.name} sub={r.purpose || undefined} chevron onClick={() => openSub(`medikamente/${r.id}`)} />;
            })}
          </Group>
        </section>
      ) : null}

      <SectionHead title="Optionen" />
      <Group>
        <Row title="Plan bearbeiten" chevron onClick={() => sheets.open((close) => <PlanSheet onClose={close} />)} />
        <Row
          title="Erinnerungen"
          chevron
          onClick={() =>
            sheets.open((close) => (
              <Sheet title="Erinnerungen" onClose={close} onDone={close} doneLabel="Fertig">
                <div className="card">
                  <PushPanel />
                </div>
              </Sheet>
            ))
          }
        />
        <Row title="Verlauf der Gaben" chevron onClick={() => openSub("m/plan")} />
      </Group>
    </Screen>
  );
}

/** Leerzeichen zwischen Zahl und Einheit nicht umbrechen („15 mg“). */
function keepUnits(s: string): string {
  return s.replace(/(\d) (?=[A-Za-zµÄÖÜäöü])/g, "$1\u00a0");
}

function RegimenRow({ r, today }: { r: Regimen; today: string }) {
  const st = regimenStyle(r);
  const cur = stepFor(r, today);
  const nc = nextChange(r, today);
  const subs = [cur ? `${cur.dose ? `${cur.dose} · ` : ""}${(r.slots || []).map((s) => s.time).join(", ")}` : "heute nicht geplant", nc ? (nc.step ? `ab ${fmtDayMonthShort(nc.day)} ${nc.step.dose || "neue Stufe"}` : `bis ${fmtDayMonthShort(addDays(nc.day, -1))}`) : "", stockText(r) || ""].filter(Boolean);
  return <Row glyph={st.glyph} color={st.color} title={r.name} sub={keepUnits(subs.join(" · "))} wrap chevron onClick={() => openSub(`medikamente/${r.id}`)} />;
}
