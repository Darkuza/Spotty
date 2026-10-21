// Übersicht wie in Health: oben die fälligen Punkte und Hinweise als Karten, dann Schnell eintragen,
// Angepinnt, Alle Daten, Trends, Highlights, „Nutze Spotty bestmöglich“ und Artikel.

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ackEntry, useChecks, useEntries, usePhotos, usePlan, useProfile, useRegimens, skipItem } from "../../lib/data";
import { useMe, useNameOf } from "../../lib/session";
import { useStatus, store } from "../../lib/store";
import { useNowValue } from "../../lib/now";
import { useSeen, markSeen } from "../../lib/seen";
import { isFreshFor } from "../../lib/fresh";
import { clinicPhone, telHref } from "../../lib/profile";
import { dismissUpdate, runUpdate, useUpdate } from "../../lib/update";
import { openSub } from "../../lib/route";
import { useConfirm, useSheets, useToast } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Avatar, CapsuleRow, CircleButton, EmptyCard, NavBar, Pill, PromptCard, Screen, SectionHead, TipCard } from "../../ui/ios";
import { itemState } from "@shared/plan.ts";
import { minutesOf } from "@shared/dates.ts";
import { TYPES, summarize } from "@shared/entryTypes.ts";
import type { Check, EntryType, PlanItem } from "@shared/types.ts";
import { earliestFor, fmtDuration } from "../../lib/gaps";
import { dayInsights, type Insight } from "../../lib/insights";
import { uploadProtocolPhoto } from "../../lib/photos";
import { metricOf } from "../../lib/health/metrics";
import { highlightsOf } from "../../lib/health/highlights";
import { useDayAlerts, OTHER_TZ } from "../common";
import { EntrySheet } from "../entry/EntrySheet";
import { EmergencySheet } from "../EmergencySheet";
import { ProfileHub } from "../profile/ProfileHub";
import { CatchUpSheet, doneLabel, fmtDiff, useCheckActions } from "../plan/actions";
import { SlotSheet } from "../plan/SlotSheet";
import { itemColor, itemGlyph, styleOf } from "../plan/planStyle";
import { MetricCard, HighlightCard } from "../health/cards";
import { useDismissed, usePinned, useQuick, useSeries, useSources } from "../health/useHealth";
import { ARTICLES } from "../articles/articles";
import { ArticleRow } from "../articles/ArticlePages";
import { PinnedEditSheet, QuickEditSheet, SetupSheet, useSetupSteps } from "./setup";
import { quickStyle } from "../../lib/health/entryStyle";

export function SummaryView() {
  const profile = useProfile();
  const sheets = useSheets();
  const name = profile?.data?.name || "Spotty";
  return (
    <Screen>
      <NavBar
        title="Übersicht"
        large
        trailing={
          <>
            <CircleButton glyph="phone" tone="red" label="Notfall" onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} />
            <Avatar name={name} onClick={() => sheets.open((close) => <ProfileHub onClose={close} />)} />
          </>
        }
        largeExtra={<StatusLine />}
      />
      <TopCards />
      <QuickLog />
      <Pinned />
      <div className="stack-cap">
        <CapsuleRow glyph="heart" color="var(--red)" label="Alle Daten anzeigen" onClick={() => openSub("alle-daten")} />
        <CapsuleRow glyph="notes" color="var(--blue)" label="Tagesprotokoll" onClick={() => openSub("protokoll")} />
      </div>
      <SectionHead title="Trends" />
      <CapsuleRow glyph="trend" color="var(--blue)" label="Alle Trends anzeigen" onClick={() => openSub("trends")} />
      <Highlights />
      <Tips />
      <Articles />
    </Screen>
  );
}

/** Verbindungsstand unter dem großen Titel, nur wenn es etwas zu sagen gibt. */
export function StatusLine() {
  const status = useStatus();
  const text = !status.online ? "Offline · Einträge werden nachgereicht" : status.pending ? `${status.pending} ${status.pending === 1 ? "Änderung wird" : "Änderungen werden"} gesendet` : OTHER_TZ ? "Alle Uhrzeiten gelten für Berlin" : "";
  if (!text) return null;
  return (
    <p className={`status-line${!status.online ? " off" : ""}`} role="status">
      <i aria-hidden="true" />
      {text}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Karten oben
// ---------------------------------------------------------------------------

const INSIGHT_LABEL: Record<string, [string, string, string]> = {
  dose: ["MEDIKAMENTE", "capsule", "var(--c-medikamente)"],
  end: ["MEDIKAMENTE", "capsule", "var(--c-medikamente)"],
  stock: ["VORRAT", "capsule", "var(--c-medikamente)"],
  spo2: ["MESSEN", "o2", "var(--c-atmung)"],
  selbst: ["ERNÄHRUNG", "drop", "var(--c-ernaehrung)"],
  aus: ["AUSSCHEIDUNG", "poop", "var(--c-ausscheidung)"],
  kg: ["KÖRPERMASSE", "scale", "var(--c-koerper)"],
};

function insightStyle(x: Insight): [string, string, string] {
  const k = x.key.split("-")[0];
  return INSIGHT_LABEL[k] || ["HINWEIS", "info", "var(--blue)"];
}

function TopCards() {
  const now = useNowValue();
  const day = now.day;
  const items = usePlan(day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const regimens = useRegimens();
  const profile = useProfile();
  const me = useMe();
  const nameOf = useNameOf();
  const seen = useSeen();
  const sheets = useSheets();
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdate();
  const alerts = useDayAlerts(entries, day);
  const [dismissed, dismiss] = useDismissed();
  const { give, skip } = useCheckActions(day, now);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const phone = clinicPhone(profile);

  const states = useMemo(() => items.map((it) => itemState(it, day, checks, entries, photos)), [items, day, checks, entries, photos]);
  const insights = useMemo(() => dayInsights(entries, regimens, profile?.data, day, now), [entries, regimens, profile, day, now]);
  const pending = items.map((it, i) => ({ it, st: states[i] })).filter((x) => !x.st.done);
  const old = pending.filter((x) => minutesOf(x.it.time) < now.minutes - 60);
  const upcoming = pending.filter((x) => minutesOf(x.it.time) >= now.minutes - 60);
  const nextTime = upcoming[0]?.it.time || null;
  const slot = nextTime ? upcoming.filter((x) => x.it.time === nextTime).map((x) => x.it) : [];

  const freshE = entries.filter((e) => isFreshFor(e, me?.user_id, seen));
  const freshP = photos.filter((p) => isFreshFor(p, me?.user_id, seen));
  const freshNames = [...new Set([...freshE, ...freshP].map((x) => nameOf(x.created_by)).filter(Boolean))];

  const measure = (it: PlanItem) => sheets.open((close) => <EntrySheet type={(it.measure || "atem") as EntryType} day={day} slot={it.slot} startCounter={it.measure === "atem"} onClose={close} />);
  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) await uploadProtocolPhoto(f, day);
      toast.show(files.length > 1 ? `${files.length} Fotos gespeichert` : "Foto gespeichert");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Foto konnte nicht hochgeladen werden.", { error: true });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const bulkSkip = async (list: PlanItem[]) => {
    const ok = await confirm({ title: `${list.length} ${list.length === 1 ? "Punkt" : "Punkte"} als ausgelassen markieren?`, text: list.map((it) => `${it.time} ${it.title}`).join(" · "), confirm: "Ausgelassen" });
    if (!ok) return;
    for (const it of list) if (!store.find<Check>("checks", { day, slot: it.slot })) skipItem(day, it.slot, it.time);
    toast.show(`${list.length} als ausgelassen markiert`);
  };

  const cards = [];

  for (const a of alerts) {
    const crit = a.level === "crit";
    cards.push(
      <PromptCard key={`a-${a.entry.id}`} role="alert" label={crit ? "KLINIK ANRUFEN" : "BITTE BEACHTEN"} labelColor={crit ? "var(--red)" : "var(--orange)"} glyph="alert" color={crit ? "var(--red)" : "var(--orange)"} title={`${TYPES[a.entry.type]?.label || "Eintrag"} um ${a.entry.time}`} text={a.text}>
        {crit && phone ? (
          <Pill kind="fill" tone="red" href={telHref(phone)}>
            Anrufen
          </Pill>
        ) : null}
        <Pill onClick={() => ackEntry(a.entry.id)}>Gesehen</Pill>
      </PromptCard>,
    );
  }

  if (update.available && !update.dismissed) {
    cards.push(
      <PromptCard key="update" label="APP" glyph="sparkle" color="var(--blue)" title="Neue Version verfügbar" text="Die neue Fassung lädt nach dem Aktualisieren; nichts geht verloren." onDismiss={dismissUpdate}>
        <Pill onClick={runUpdate}>Jetzt aktualisieren</Pill>
      </PromptCard>,
    );
  }

  if (old.length) {
    const checksOld = old.filter((x) => x.it.kind === "check").map((x) => x.it);
    cards.push(
      <PromptCard key="old" label="NOCH OFFEN" labelColor="var(--orange)" glyph="alert" color="var(--orange)" title={old.length === 1 ? "1 Punkt ist noch offen" : `${old.length} Punkte sind noch offen`} text={old.map((x) => `${x.it.time} ${x.it.title}`).join(" · ")}>
        {checksOld.length ? (
          <>
            <Pill onClick={() => sheets.open((close) => <CatchUpSheet day={day} items={checksOld} onClose={close} />)}>Nachtragen</Pill>
            <Pill kind="plain" onClick={() => void bulkSkip(checksOld)}>
              Ausgelassen
            </Pill>
          </>
        ) : null}
      </PromptCard>,
    );
  }

  if (slot.length && nextTime) {
    const diff = minutesOf(nextTime) - now.minutes;
    const timing = diff <= -20 ? `Seit ${fmtDiff(-diff)} fällig.` : diff <= 0 ? "Jetzt fällig." : diff <= 10 ? `In ${diff} Min. fällig.` : `In ${fmtDiff(diff)} fällig.`;
    const single = slot.length === 1 ? slot[0] : null;
    const cats = [...new Set(slot.map((it) => it.category))];
    const style = single ? { glyph: itemGlyph(single), color: itemColor(single) } : cats.length === 1 ? styleOf(cats[0], slot[0].measure) : { glyph: "calendar", color: "var(--c-medikamente)" };
    const label = `${(single ? styleOf(single.category, single.measure).label : cats.length === 1 ? styleOf(cats[0]).label : "Tagesplan").toUpperCase()} · ${nextTime}`;
    const early = single && single.kind === "check" ? earliestFor(regimens, items, day, checks, single) : null;
    const tooEarly = early && minutesOf(early.at) > now.minutes ? early : null;
    const late = now.minutes - minutesOf(nextTime) > 45;
    const due = diff <= 10;
    cards.push(
      <PromptCard
        key={`slot-${nextTime}`}
        label={label}
        labelColor={due ? style.color : undefined}
        glyph={style.glyph}
        color={style.color}
        title={single ? single.title : `${slot.length} Punkte um ${nextTime} Uhr`}
        text={
          <>
            <span className={diff <= -20 ? "pc-late" : undefined}>{timing}</span> {single ? single.detail : slot.map((it) => it.title).join(" · ")}
            {tooEarly ? (
              <span className="pc-warn">
                Frühestens um {tooEarly.at}: laut Plan {fmtDuration(tooEarly.minutes)} Abstand zu {tooEarly.otherName}.
              </span>
            ) : null}
          </>
        }
      >
        {single && single.kind === "check" ? (
          <>
            <Pill kind={due ? "fill" : "tint"} onClick={() => give(single)}>
              {doneLabel(single)}
              {late ? " …" : ""}
            </Pill>
            <Pill kind="plain" onClick={() => skip(single)}>
              Ausgelassen
            </Pill>
          </>
        ) : single && single.kind === "mess" ? (
          <>
            <Pill kind={due ? "fill" : "tint"} onClick={() => measure(single)}>
              {single.measure === "atem" ? "Atemzüge zählen" : "Eintragen"}
            </Pill>
            <Pill kind="plain" onClick={() => skip(single)}>
              Ausgelassen
            </Pill>
          </>
        ) : single ? (
          <>
            <Pill kind={due ? "fill" : "tint"} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Wird hochgeladen …" : "Foto aufnehmen"}
            </Pill>
            <Pill kind="plain" onClick={() => skip(single)}>
              Ausgelassen
            </Pill>
          </>
        ) : (
          <Pill kind={due ? "fill" : "tint"} onClick={() => sheets.open((close) => <SlotSheet day={day} time={nextTime} onClose={close} />)}>
            Protokollieren
          </Pill>
        )}
      </PromptCard>,
    );
  } else if (items.length && !pending.length && !dismissed.has(`done|${day}`)) {
    cards.push(<PromptCard key="done" label="TAGESPLAN" glyph="checklist" color="var(--green)" title="Für heute ist alles erledigt" text={`${items.length === 1 ? "1 Punkt" : `${items.length} Punkte`} abgehakt, eingetragen oder bewusst ausgelassen.`} onDismiss={() => dismiss(`done|${day}`)} />);
  }

  if (freshE.length + freshP.length) {
    const latest = [...freshE].sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time)).slice(0, 3);
    cards.push(
      <PromptCard
        key="fresh"
        label="NEU VON DER FAMILIE"
        glyph="people"
        color="var(--blue)"
        title={`${freshE.length + freshP.length} ${freshE.length + freshP.length === 1 ? "neuer Eintrag" : "neue Einträge"}${freshNames.length ? ` von ${freshNames.join(", ").replace(/, ([^,]*)$/, " und $1")}` : ""}`}
        text={[...latest.map((e) => `${e.time} ${TYPES[e.type]?.short || ""}${summarize(e) ? `: ${summarize(e)}` : ""}`), freshP.length ? `${freshP.length} ${freshP.length === 1 ? "Foto" : "Fotos"} vom Papierprotokoll` : ""].filter(Boolean).join(" · ")}
        onDismiss={() => markSeen()}
      >
        <Pill onClick={() => openSub("protokoll")}>Ansehen</Pill>
      </PromptCard>,
    );
  }

  // „SpO₂ noch nicht gemessen“ entfällt, solange die Messung ohnehin als offener Planpunkt erscheint
  const spoInPlan = pending.some((x) => x.it.kind === "mess" && x.it.measure === "spo2") && !entries.some((e) => e.type === "spo2");
  for (const x of insights) {
    const key = `${x.key}|${day}`;
    if (dismissed.has(key)) continue;
    if (x.key === "spo2" && spoInPlan) continue;
    const [label, glyph, color] = insightStyle(x);
    const entry = x.key === "spo2" ? "spo2" : x.key === "kg" ? "gewicht" : null;
    const ausTypes = x.key === "aus" ? (["kot", "urin"] as const).filter((t) => x.title.includes(t === "kot" ? "Kot" : "Urin")) : [];
    cards.push(
      <PromptCard key={`i-${x.key}`} label={label} glyph={glyph} color={color} title={x.title} text={x.text} onDismiss={() => dismiss(key)}>
        {entry ? <Pill onClick={() => sheets.open((close) => <EntrySheet type={entry as EntryType} day={day} onClose={close} />)}>Eintragen</Pill> : null}
        {ausTypes.map((t) => (
          <Pill key={t} onClick={() => sheets.open((close) => <EntrySheet type={t} day={day} onClose={close} />)}>
            {t === "kot" ? "Kot eintragen" : "Urin eintragen"}
          </Pill>
        ))}
      </PromptCard>,
    );
  }

  return (
    <div className="pcs">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
      {cards}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schnell eintragen und Angepinnt
// ---------------------------------------------------------------------------

function QuickLog() {
  const [quick] = useQuick();
  const sheets = useSheets();
  const now = useNowValue();
  const open = (t: EntryType) => sheets.open((close) => <EntrySheet type={t} day={now.day} startCounter={t === "atem"} onClose={close} />);
  return (
    <section aria-label="Schnell eintragen">
      <SectionHead title="Schnell eintragen" action={{ label: "Bearbeiten", onClick: () => sheets.open((close) => <QuickEditSheet onClose={close} />) }} />
      {quick.length ? (
        <div className="qlog">
          {quick.map((t) => {
            const st = quickStyle(t);
            return (
              <button key={t} type="button" className="qtile" style={{ "--cat": st.color } as CSSProperties} onClick={() => open(t)}>
                <Glyph name={st.glyph} size={26} />
                <span>{TYPES[t]?.short || t}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyCard title="Keine Knöpfe ausgewählt">Mit „Bearbeiten“ festlegen, was hier zum schnellen Eintragen steht.</EmptyCard>
      )}
    </section>
  );
}

function PinnedCard({ id }: { id: string }) {
  const src = useSources();
  const def = metricOf(id);
  const s = useSeries(def, src);
  if (!def || !s) return null;
  return <MetricCard def={def} series={s} onClick={() => openSub(def.id === "plan" ? "medikamente" : `m/${def.id}`)} />;
}

function Pinned() {
  const [pinned] = usePinned();
  const sheets = useSheets();
  return (
    <section aria-label="Angepinnt">
      <SectionHead title="Angepinnt" action={{ label: "Bearbeiten", onClick: () => sheets.open((close) => <PinnedEditSheet onClose={close} />) }} />
      {pinned.length ? (
        <div className="mcards">
          {pinned.map((id) => (
            <PinnedCard key={id} id={id} />
          ))}
        </div>
      ) : (
        <EmptyCard title="Nichts angepinnt">Mit „Bearbeiten“ die Werte wählen, die hier stehen sollen.</EmptyCard>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Highlights, Tipps, Artikel
// ---------------------------------------------------------------------------

function Highlights() {
  const src = useSources();
  const now = useNowValue();
  const list = useMemo(() => highlightsOf(src, now), [src, now]);
  return (
    <section aria-label="Highlights">
      <SectionHead title="Highlights" />
      {list.length ? (
        <div className="mcards">
          {list.slice(0, 2).map((h) => (
            <HighlightCard key={h.id} hl={h} onClick={() => openSub(h.metric === "plan" ? "medikamente" : `m/${h.metric}`)} />
          ))}
        </div>
      ) : (
        <EmptyCard title="Noch keine Highlights">Sie erscheinen, sobald es für ein paar Tage Einträge gibt, etwa zum Trinken oder zu den Atemzügen.</EmptyCard>
      )}
      <CapsuleRow glyph="sparkle" color="var(--blue)" label="Alle Highlights anzeigen" onClick={() => openSub("highlights")} />
    </section>
  );
}

function Tips() {
  const { steps, ready } = useSetupSteps();
  const [dismissed, dismiss] = useDismissed();
  const sheets = useSheets();
  const open = ready ? steps.filter((s) => !s.done && !dismissed.has(`tip|${s.key}`)) : [];
  return (
    <section aria-label="Nutze Spotty bestmöglich">
      <SectionHead title="Nutze Spotty bestmöglich" />
      {open.length ? (
        <div className="mcards">
          {open.slice(0, 3).map((s) => (
            <TipCard key={s.key} glyph={s.glyph} color={s.color} title={s.title} text={s.text} action={s.action ? { label: s.action.label, onClick: s.action.run } : undefined} onDismiss={() => dismiss(`tip|${s.key}`)} />
          ))}
        </div>
      ) : null}
      <CapsuleRow glyph="checklist" color="var(--red)" label="Einrichtung" onClick={() => sheets.open((close) => <SetupSheet onClose={close} />)} />
    </section>
  );
}

function Articles() {
  return (
    <section aria-label="Artikel">
      <SectionHead title="Artikel" />
      <div className="arows">
        {ARTICLES.slice(0, 2).map((a) => (
          <ArticleRow key={a.id} a={a} />
        ))}
      </div>
      <CapsuleRow glyph="book" color="var(--blue)" label="Alle Inhalte anzeigen" onClick={() => openSub("artikel")} />
    </section>
  );
}
