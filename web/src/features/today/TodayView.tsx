// Heute: was als Nächstes dran ist, offene Punkte, angeheftete Werte, Tagesplan zum Abhaken, Hinweise.

import { useMemo, useRef, useState } from "react";
import { useChecks, useEntries, usePhotos, usePlan, useProfile, useRegimens, checkItem, skipItem, uncheckItem, setCheckTime, saveRegimen } from "../../lib/data";
import { useNameOf } from "../../lib/session";
import { useSheets, useToast, Sheet, useConfirm } from "../../ui/overlays";
import { Icon } from "../../ui/Icon";
import { PageHeader, Section } from "../../ui/Page";
import { CAT_LABEL, categoryStyle } from "../../ui/kinds";
import { AlertBanners, DayBar, Empty, HeaderActions, dayTitle, useDayAlerts } from "../common";
import { EntrySheet } from "../entry/EntrySheet";
import { itemState, therapyStart, type ItemState } from "@shared/plan.ts";
import { addDays, berlinNow, daysBetween, fmtDMY, fmtDayShort, isValidDay, isValidHm, minutesOf, type BerlinNow } from "@shared/dates.ts";
import { LAGE_KURZ, fmtNum, optLabel, summarize } from "@shared/entryTypes.ts";
import { dayStats, fluidOfDay, foodOfDay } from "@shared/stats.ts";
import type { Check, Entry, EntryType, PlanItem, Regimen } from "@shared/types.ts";
import { uploadProtocolPhoto } from "../../lib/photos";
import { clinicPhone } from "../../lib/profile";
import { SetupCard } from "./SetupCard";
import { store } from "../../lib/store";
import { amountOf } from "../../lib/dose";
import { earliestFor, fmtDuration, gapConflicts, type GapConflict } from "../../lib/gaps";
import { dayInsights, type Insight } from "../../lib/insights";
import { navigate } from "../../lib/route";

type Status = "done" | "skip" | "now" | "over" | "future" | "past";

function statusOf(st: ItemState, it: PlanItem, day: string, now: BerlinNow): Status {
  if (st.skipped) return "skip";
  if (st.done) return "done";
  if (day < now.day) return "past";
  if (day > now.day) return "future";
  const diff = minutesOf(it.time) - now.minutes;
  if (diff <= -20) return "over";
  if (diff <= 10) return "now";
  return "future";
}

export function fmtDiff(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Verb für das Abhaken je Kategorie */
export function doneVerb(it: PlanItem): string {
  return it.category === "med" ? "gegeben" : "erledigt";
}

/** Abhaken mit Rückfrage bei deutlicher Verspätung; gemeinsam für Heute und die einfache Ansicht. */
export function useCheckActions(day: string, now: BerlinNow) {
  const sheets = useSheets();
  const toast = useToast();
  const isToday = day === now.day;
  const give = (it: PlanItem) => {
    if (isToday && now.minutes - minutesOf(it.time) > 45) {
      sheets.open((close) => (
        <WhenSheet
          item={it}
          nowHm={now.hm}
          onClose={close}
          onPick={(time) => {
            checkItem(day, it.slot, time);
            toast.show(`${it.title} · ${time}`, { action: { label: "Rückgängig", run: () => uncheckItem(day, it.slot) } });
            close();
          }}
        />
      ));
      return;
    }
    const time = isToday ? now.hm : it.time;
    checkItem(day, it.slot, time);
    toast.show(`${it.title} · ${time}`, { action: { label: "Rückgängig", run: () => uncheckItem(day, it.slot) } });
  };
  const skip = (it: PlanItem) => {
    skipItem(day, it.slot, isToday ? now.hm : it.time);
    toast.show(`${it.title} ausgelassen`, { action: { label: "Rückgängig", run: () => uncheckItem(day, it.slot) } });
  };
  return { give, skip };
}

export function TodayView({ day, now, onDay }: { day: string; now: BerlinNow; onDay: (d: string) => void }) {
  const items = usePlan(day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const regimens = useRegimens();
  const profile = useProfile();
  const nameOf = useNameOf();
  const sheets = useSheets();
  const toast = useToast();
  const confirm = useConfirm();
  const alerts = useDayAlerts(entries, day);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { give, skip } = useCheckActions(day, now);

  const states = useMemo(() => items.map((it) => itemState(it, day, checks, entries, photos)), [items, day, checks, entries, photos]);
  const conflicts = useMemo(() => gapConflicts(regimens, items, day, checks), [regimens, items, day, checks]);
  const insights = useMemo(() => dayInsights(entries, regimens, profile?.data, day, now), [entries, regimens, profile, day, now]);
  const doneCount = states.filter((s) => s.done).length;
  const isToday = day === now.day;
  const start = therapyStart(regimens);
  const therapyDay = start && day >= start ? daysBetween(start, day) + 1 : null;

  const openMeasure = (it: PlanItem, counter = false) => {
    const st = states[items.indexOf(it)];
    const existing = st?.done && !st.skipped ? (st.ref as Entry) : null;
    sheets.open((close) => <EntrySheet type={(it.measure || "atem") as EntryType} day={day} slot={it.slot} entry={existing} startCounter={counter} onClose={close} />);
  };

  const openCheck = (it: PlanItem, st: ItemState) => {
    const c = st.ref as Check;
    sheets.open((close) => (
      <CheckSheet
        item={it}
        check={c}
        by={nameOf(c.created_by)}
        onClose={close}
        onRemove={async () => {
          const ok = await confirm({ title: "Häkchen entfernen?", text: `${it.title} gilt dann wieder als offen.`, confirm: "Entfernen", danger: true });
          if (ok) {
            uncheckItem(day, it.slot);
            close();
          }
        }}
      />
    ));
  };

  const pickPhoto = () => fileRef.current?.click();
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

  // Was ist dran? Lange überfällige Punkte (über 60 Minuten) besetzen die große Karte nicht.
  const pending = items.map((it, i) => ({ it, st: states[i] })).filter((x) => !x.st.done);
  const old = isToday ? pending.filter((x) => minutesOf(x.it.time) < now.minutes - 60) : [];
  const upcoming = isToday ? pending.filter((x) => minutesOf(x.it.time) >= now.minutes - 60) : pending;
  const hero = upcoming[0] || old[0] || null;
  const oldRest = old.filter((x) => x !== hero);
  const waiting = regimens.filter((r) => r.active && (r.category === "med" || r.category === "inh") && !(r.steps || []).length).sort((a, b) => a.sort - b.sort);

  const header = (
    <PageHeader
      title={dayTitle(day, now.day)}
      actions={<HeaderActions />}
      sub={
        <>
          <DayBar day={day} today={now.day} onChange={onDay} />
          {therapyDay ? <span className="info-chip teal">Behandlungstag {therapyDay}</span> : null}
        </>
      }
    />
  );

  if (!items.length) {
    return (
      <div className="page">
        {header}
        <div className="blk">
          <SetupCard />
        </div>
        <div className="card blk">
          <Empty title="Noch kein Tagesplan">
            <p>Der Behandlungsplan kommt mit dem Import der Akte (Mehr → Akte importieren) oder wird unter Mehr → Behandlungsplan angelegt.</p>
          </Empty>
        </div>
      </div>
    );
  }

  const bulkSkip = async () => {
    const list = oldRest.filter((x) => x.it.kind === "check").map((x) => x.it);
    if (!list.length) return;
    const ok = await confirm({ title: `${list.length} ${list.length === 1 ? "Punkt" : "Punkte"} als ausgelassen markieren?`, text: list.map((it) => `${it.time} ${it.title}`).join(" · "), confirm: "Als ausgelassen markieren" });
    if (!ok) return;
    for (const it of list) if (!store.find<Check>("checks", { day, slot: it.slot })) skipItem(day, it.slot, it.time);
    toast.show(`${list.length} als ausgelassen markiert`);
  };

  return (
    <div className="page">
      {header}
      {isToday ? (
        <div className="blk">
          <SetupCard />
        </div>
      ) : null}
      <AlertBanners alerts={alerts} phone={clinicPhone(profile)} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />

      <div className="blk">
        {isToday ? (
          <Hero
            hero={hero}
            next={upcoming.filter((x) => x !== hero).slice(0, 2).map((x) => x.it)}
            now={now}
            earliest={hero ? earliestFor(regimens, items, day, checks, hero.it) : null}
            onGive={give}
            onSkip={skip}
            onMeasure={openMeasure}
            onPhoto={pickPhoto}
            uploading={uploading}
            allDone={!pending.length}
          />
        ) : (
          <div className="card row between">
            <b>{day < now.day ? "Rückblick" : "Vorschau"} · {fmtDayShort(day)}</b>
            <span className="muted">
              {doneCount} von {items.length} erledigt
            </span>
          </div>
        )}
      </div>

      {oldRest.length ? (
        <div className="note col tone-amber blk-s">
          <div className="note-head">
            <Icon name="alert" size={19} stroke={2} />
            {oldRest.length === 1 ? "1 Punkt ist noch offen" : `${oldRest.length} Punkte sind noch offen`}
          </div>
          <p className="note-text" style={{ fontSize: 14, lineHeight: "20px" }}>
            {oldRest.map((x) => `${x.it.time} ${x.it.title}`).join(" · ")}
          </p>
          {oldRest.some((x) => x.it.kind === "check") ? (
            <div className="note-actions">
              <button className="btn small warn-soft" onClick={() => sheets.open((close) => <CatchUpSheet day={day} items={oldRest.filter((x) => x.it.kind === "check").map((x) => x.it)} onClose={close} />)}>
                Nachtragen
              </button>
              <button className="btn small warn-soft" onClick={() => void bulkSkip()}>
                Als ausgelassen markieren
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isToday ? <Pinned day={day} /> : null}

      <Section title="Tagesplan" aside={`${doneCount} von ${items.length}`}>
        <div className="list plan">
          {items.map((it, i) => (
            <PlanRow
              key={it.slot}
              it={it}
              st={states[i]}
              status={statusOf(states[i], it, day, now)}
              who={states[i].done ? nameOf(states[i].by) : ""}
              photoCount={it.kind === "foto" ? photos.filter((p) => p.day === day).length : 0}
              conflicts={conflicts.filter((c) => c.slot === it.slot)}
              uploading={uploading}
              onCheck={() => (states[i].done ? openCheck(it, states[i]) : give(it))}
              onMeasure={(counter) => openMeasure(it, counter)}
              onPhoto={() => (states[i].done && !states[i].skipped ? navigate("protokoll") : pickPhoto())}
            />
          ))}
          {waiting.map((r) => (
            <WaitingRow key={r.id} regimen={r} />
          ))}
        </div>
      </Section>

      {insights.length ? <Insights items={insights} /> : null}
    </div>
  );
}

function Hero({
  hero,
  next,
  now,
  earliest,
  onGive,
  onSkip,
  onMeasure,
  onPhoto,
  uploading,
  allDone,
}: {
  hero: { it: PlanItem; st: ItemState } | null;
  next: PlanItem[];
  now: BerlinNow;
  earliest: { at: string; minutes: number; otherName: string } | null;
  onGive: (it: PlanItem) => void;
  onSkip: (it: PlanItem) => void;
  onMeasure: (it: PlanItem, counter?: boolean) => void;
  onPhoto: () => void;
  uploading: boolean;
  allDone: boolean;
}) {
  if (!hero || allDone) {
    return (
      <section className="hero" aria-live="polite">
        <div className="hero-top">
          <span className="lab">Heute</span>
        </div>
        <div className="hero-main">
          <span className="hero-time done" aria-hidden="true">
            <Icon name="check" size={44} stroke={2.6} />
          </span>
          <div className="hero-body">
            <p className="hero-title">Alles erledigt</p>
            <p className="t2">Alle Punkte des Tages sind abgehakt oder eingetragen.</p>
          </div>
        </div>
      </section>
    );
  }
  const { it } = hero;
  const diff = minutesOf(it.time) - now.minutes;
  const cls = diff <= -20 ? "over" : diff <= 10 ? "due" : "";
  const eyebrow = diff <= -20 ? `Seit ${fmtDiff(-diff)} fällig` : diff <= 0 ? "Jetzt dran" : diff <= 10 ? `In ${diff} Min. dran` : "Als Nächstes";
  const ks = categoryStyle(it.category, it.measure);
  const tooEarly = earliest && minutesOf(earliest.at) > now.minutes ? earliest : null;
  return (
    <section className={`hero ${cls}`} aria-live="polite" aria-label="Als Nächstes">
      <div className="hero-top">
        <span className="lab">{eyebrow}</span>
        {diff > 10 ? <span className="info-chip">in {fmtDiff(diff)}</span> : null}
      </div>
      <div className="hero-main">
        <span className="hero-time">{it.time}</span>
        <div className="hero-body">
          <div className="hero-cat">
            <span className={`ico k-${ks.kind}`}>
              <Icon name={ks.icon} size={15} stroke={2} />
            </span>
            <span className={`lab c-${ks.kind}`}>{CAT_LABEL[it.category]}</span>
          </div>
          <p className="hero-title">{it.title}</p>
          {it.detail ? <p className="t2">{it.detail}</p> : null}
        </div>
      </div>
      {tooEarly ? (
        <p className="hero-warn">
          Frühestens um {tooEarly.at}: laut Plan {fmtDuration(tooEarly.minutes)} Abstand zu {tooEarly.otherName}.
        </p>
      ) : null}
      {it.kind === "check" ? (
        <div className="hero-actions">
          <button className="btn primary" onClick={() => onGive(it)}>
            <Icon name="check" size={19} stroke={2.4} /> {it.category === "med" ? "Gegeben" : "Erledigt"}
            {now.minutes - minutesOf(it.time) > 45 ? " …" : ""}
          </button>
          <button className="btn" onClick={() => onSkip(it)}>
            Ausgelassen
          </button>
        </div>
      ) : it.kind === "mess" ? (
        <div className={`hero-actions${it.measure === "atem" ? "" : " single"}`}>
          {it.measure === "atem" ? (
            <button className="btn primary" onClick={() => onMeasure(it, true)}>
              Atemzüge zählen
            </button>
          ) : null}
          <button className={`btn${it.measure === "atem" ? "" : " primary"}`} onClick={() => onMeasure(it, false)}>
            {it.measure === "atem" ? "Eintragen" : "Wert eintragen"}
          </button>
        </div>
      ) : (
        <div className="hero-actions single">
          <button className="btn primary" onClick={onPhoto} disabled={uploading}>
            <Icon name="camera" size={19} /> {uploading ? "Wird hochgeladen …" : "Foto aufnehmen"}
          </button>
        </div>
      )}
      {it.kind !== "check" ? (
        <button className="link-btn" style={{ alignSelf: "flex-start", marginTop: -6 }} onClick={() => onSkip(it)}>
          Heute auslassen
        </button>
      ) : null}
      {next.length ? <p className="hero-after">Danach {next.map((n) => `${n.time} ${n.title}`).join(" · ")}</p> : null}
    </section>
  );
}

function PlanRow({
  it,
  st,
  status,
  who,
  photoCount,
  conflicts,
  uploading,
  onCheck,
  onMeasure,
  onPhoto,
}: {
  it: PlanItem;
  st: ItemState;
  status: Status;
  who: string;
  photoCount: number;
  conflicts: GapConflict[];
  uploading: boolean;
  onCheck: () => void;
  onMeasure: (counter: boolean) => void;
  onPhoto: () => void;
}) {
  const ks = categoryStyle(it.category, it.measure);
  const meta = st.done ? (
    st.skipped ? (
      <span className="pmeta skip">
        <Icon name="skip" size={15} stroke={2} />
        ausgelassen · {st.at}
        {who ? ` · ${who}` : ""}
      </span>
    ) : (
      <span className="pmeta">
        <Icon name="check" size={15} stroke={2.4} />
        {it.kind === "mess" ? `${summarize(st.ref as Entry)} · ${st.at}` : it.kind === "foto" ? `${photoCount} ${photoCount === 1 ? "Foto" : "Fotos"} · zuletzt ${st.at}` : `${doneVerb(it)} ${st.at}`}
        {who ? ` · ${who}` : ""}
      </span>
    )
  ) : it.detail ? (
    <span className="t2 clamp2">{it.detail}</span>
  ) : null;
  const note = conflicts.length ? (
    <p className="plan-note">
      {conflicts
        .sort((a, b) => a.diff - b.diff)
        .map((c) => `${fmtDuration(c.diff)} ${c.after ? "nach" : "vor"} ${c.otherName}`)
        .join(", ")}
      . Laut Plan {fmtDuration(conflicts[0].minutes)} Abstand.
    </p>
  ) : null;
  return (
    <div className={`li ${status}`}>
      <span className="pt">{it.time}</span>
      <span className={`ico sm k-${ks.kind}`} aria-hidden="true">
        <Icon name={ks.icon} size={17} stroke={2} />
      </span>
      <div className="pbody">
        <span className="t1">{it.title}</span>
        {meta}
        {note}
      </div>
      <div className="pctl">
        {it.kind === "check" ? (
          <button className={`check${st.done ? (st.skipped ? " skip" : " on") : ""}`} onClick={onCheck} aria-label={st.done ? `${it.title}: ${st.skipped ? "ausgelassen" : doneVerb(it)} ${st.at}, bearbeiten` : `${it.title} abhaken`}>
            <Icon name={st.skipped ? "minus" : "check"} size={20} stroke={2.6} />
          </button>
        ) : it.kind === "mess" ? (
          <button className="item-action mess" onClick={() => onMeasure(it.measure === "atem" && !(st.done && !st.skipped))}>
            {st.done && !st.skipped ? "Ändern" : it.measure === "atem" ? "Zählen" : "Eintragen"}
          </button>
        ) : (
          <button className="item-action" onClick={onPhoto} disabled={uploading}>
            {uploading ? "Lädt …" : st.done && !st.skipped ? "Ansehen" : "Foto"}
          </button>
        )}
      </div>
    </div>
  );
}

function WaitingRow({ regimen: r }: { regimen: Regimen }) {
  const sheets = useSheets();
  const ks = categoryStyle(r.category, r.measure);
  return (
    <div className="li">
      <span className="pt" aria-hidden="true">
        –
      </span>
      <span className={`ico sm k-${ks.kind}`} aria-hidden="true">
        <Icon name={ks.icon} size={17} stroke={2} />
      </span>
      <div className="pbody">
        <span className="t1">{r.name}</span>
        <span className="t2">noch nicht begonnen{r.slots?.length ? ` · geplant ${r.slots.map((sl) => sl.time).join(", ")}` : ""}</span>
      </div>
      <div className="pctl">
        <button className="item-action" onClick={() => sheets.open((close) => <StartSheet regimen={r} onClose={close} />)}>
          Beginnen
        </button>
      </div>
    </div>
  );
}

/** Angeheftete Tageswerte: Atemzüge, Trinken, Futter, Sättigung. */
function Pinned({ day }: { day: string }) {
  const entries = useEntries();
  const st = useMemo(() => dayStats(entries, day), [entries, day]);
  const lastAtem = st.atem[st.atem.length - 1];
  const lastAtemEntry = useMemo(() => [...entries].filter((e) => e.day === day && e.type === "atem").sort((a, b) => b.time.localeCompare(a.time))[0], [entries, day]);
  const fl = fluidOfDay(st);
  const fo = foodOfDay(st);
  const lastSpo = st.spo2[st.spo2.length - 1];
  const atemSub = (() => {
    if (!lastAtem) return "heute noch nicht gezählt";
    if (st.atem.length > 1 && st.atemWert != null) return `Median heute ${fmtNum(st.atemWert)}`;
    const d = (lastAtemEntry?.data || {}) as Record<string, unknown>;
    return [d.zustand ? optLabel("atem", "zustand", d.zustand) : "", typeof d.lage === "string" ? LAGE_KURZ[d.lage] || d.lage : ""].filter(Boolean).join(" · ") || "eine Zählung";
  })();
  return (
    <Section title="Angeheftet" link={{ label: "Alle Werte", onClick: () => navigate("verlauf") }}>
      <div className="tiles">
        <button className="tile" onClick={() => navigate("verlauf/atem")}>
          <span className="tile-head c-mess">
            <Icon name="lungs" size={16} stroke={2} /> Atemzüge
            {lastAtem ? <span className="when">{lastAtem.time}</span> : null}
          </span>
          <span className={`tile-val${lastAtem ? "" : " none"}`}>
            {lastAtem ? fmtNum(lastAtem.bpm) : "–"}
            {lastAtem ? <span className="unit">/min</span> : null}
          </span>
          <span className="tile-sub">{atemSub}</span>
        </button>
        <button className="tile" onClick={() => navigate("verlauf/trinken")}>
          <span className="tile-head c-food">
            <Icon name="drop" size={16} stroke={2} /> Getrunken
            {st.lastTrinken ? <span className="when">{st.lastTrinken}</span> : null}
          </span>
          <span className={`tile-val${fl.ml != null ? "" : " none"}`}>
            {fl.ml != null ? fmtNum(fl.ml) : "–"}
            {fl.ml != null ? <span className="unit">ml</span> : null}
          </span>
          <span className="tile-sub">{fl.source === "papier" ? "laut Papier" : st.selbstMl ? `davon ${fmtNum(st.selbstMl)} ml selbst` : st.trinkenN ? "per Spritze" : "heute noch nichts"}</span>
        </button>
        <button className="tile" onClick={() => navigate("verlauf/futter")}>
          <span className="tile-head c-food">
            <Icon name="bowl" size={16} stroke={2} /> Gefressen
            {st.lastFutter ? <span className="when">{st.lastFutter}</span> : null}
          </span>
          <span className={`tile-val${fo.g != null ? "" : " none"}`}>
            {fo.g != null ? fmtNum(fo.g) : "–"}
            {fo.g != null ? <span className="unit">g</span> : null}
          </span>
          <span className="tile-sub">{fo.source === "papier" ? "laut Papier" : st.futterN ? `${st.futterN} ${st.futterN === 1 ? "Mahlzeit" : "Mahlzeiten"}${st.abgelehnt ? ` · ${st.abgelehnt}× abgelehnt` : ""}` : st.abgelehnt ? `${st.abgelehnt}× abgelehnt` : "heute noch nichts"}</span>
        </button>
        <button className="tile" onClick={() => navigate("verlauf/spo2")}>
          <span className="tile-head c-mess">
            <Icon name="pulse" size={16} stroke={2} /> SpO₂
            {lastSpo ? <span className="when">{lastSpo.time}</span> : null}
          </span>
          <span className={`tile-val${lastSpo ? "" : " none"}`}>
            {lastSpo ? fmtNum(lastSpo.pct) : "–"}
            {lastSpo ? <span className="unit">%</span> : null}
          </span>
          <span className="tile-sub">{lastSpo ? (st.spo2.length > 1 ? `niedrigster heute ${fmtNum(st.spo2Min)} %` : "eine Messung") : "heute nicht gemessen"}</span>
        </button>
      </div>
    </Section>
  );
}

const TONE_KIND: Record<Insight["tone"], string> = { teal: "k-med", amber: "k-food", blue: "k-mess", gray: "k-obs" };

function Insights({ items }: { items: Insight[] }) {
  return (
    <Section title="Hinweise">
      <div className="list">
        {items.map((x) => (
          <div key={x.key} className="li top">
            <span className={`ico ${TONE_KIND[x.tone]}`} aria-hidden="true">
              <Icon name={x.icon} size={18} stroke={2} />
            </span>
            <div className="grow">
              <p className="t1">{x.title}</p>
              <p className="t2">{x.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function WhenSheet({ item, nowHm, onClose, onPick }: { item: PlanItem; nowHm: string; onClose: () => void; onPick: (time: string) => void }) {
  const [time, setTime] = useState(item.time);
  const verb = doneVerb(item);
  return (
    <Sheet title={`Wann ${verb}?`} onClose={onClose}>
      <p>
        <b>{item.title}</b> war für <span className="num">{item.time}</span> geplant.
      </p>
      <div className="grid-2">
        <button className="btn primary" onClick={() => onPick(item.time)}>
          um {item.time}
        </button>
        <button className="btn" onClick={() => onPick(nowHm)}>
          jetzt, {nowHm}
        </button>
      </div>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
        <div className="field grow">
          <label htmlFor="when-time">andere Uhrzeit</label>
          <input id="when-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <button className="btn" onClick={() => time && onPick(time)} disabled={!/^\d{2}:\d{2}$/.test(time)}>
          Übernehmen
        </button>
      </div>
    </Sheet>
  );
}

function CheckSheet({ item, check, by, onClose, onRemove }: { item: PlanItem; check: Check; by: string; onClose: () => void; onRemove: () => void }) {
  const [time, setTime] = useState(check.time);
  const toast = useToast();
  const skipped = !!check.skipped;
  return (
    <Sheet
      title={item.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn danger" onClick={onRemove}>
            Häkchen entfernen
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (time !== check.time && isValidHm(time)) {
                setCheckTime(check.day, check.slot, time);
                toast.show(`Uhrzeit auf ${time} geändert`);
              }
              onClose();
            }}
          >
            Fertig
          </button>
        </>
      }
    >
      <p>
        {skipped ? "Ausgelassen" : item.category === "med" ? "Gegeben" : "Erledigt"} um <b className="num">{check.time}</b>
        {by ? ` von ${by}` : ""}.
      </p>
      {check.note ? <p className="hint">{check.note}</p> : null}
      <div className="field">
        <label htmlFor="check-time">Uhrzeit korrigieren</label>
        <input id="check-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ maxWidth: 160 }} />
      </div>
      <button
        className="btn"
        onClick={() => {
          if (skipped) checkItem(check.day, check.slot, isValidHm(time) ? time : check.time);
          else skipItem(check.day, check.slot, isValidHm(time) ? time : check.time);
          toast.show(skipped ? `${item.title}: doch ${doneVerb(item)}` : `${item.title}: als ausgelassen markiert`);
          onClose();
        }}
      >
        {skipped ? `Doch ${doneVerb(item)}` : "Als ausgelassen markieren"}
      </button>
      {item.detail ? <p className="hint">{item.detail}</p> : null}
    </Sheet>
  );
}

/** Mehrere verpasste Punkte auf einmal abhaken, jeweils mit der tatsächlichen Uhrzeit. */
function CatchUpSheet({ day, items, onClose }: { day: string; items: PlanItem[]; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState(() => items.map((it) => ({ it, on: true, time: it.time })));
  const [error, setError] = useState<string | null>(null);
  const count = rows.filter((r) => r.on && isValidHm(r.time)).length;
  const save = () => {
    const now = berlinNow();
    const future = rows.find((r) => r.on && isValidHm(r.time) && day === now.day && minutesOf(r.time) > now.minutes);
    if (future) {
      setError(`${future.it.title}: ${future.time} Uhr liegt noch in der Zukunft. Bitte die Uhrzeit prüfen.`);
      return;
    }
    let saved = 0;
    let skipped = 0;
    for (const r of rows) {
      if (!r.on || !isValidHm(r.time)) continue;
      // Hat jemand anderes den Punkt inzwischen abgehakt, bleibt dessen Eintrag stehen.
      if (store.find<Check>("checks", { day, slot: r.it.slot })) {
        skipped++;
        continue;
      }
      checkItem(day, r.it.slot, r.time);
      saved++;
    }
    toast.show(`${saved} ${saved === 1 ? "Punkt" : "Punkte"} nachgetragen${skipped ? ` · ${skipped} hatte schon jemand abgehakt` : ""}`);
    onClose();
  };
  return (
    <Sheet
      title="Nachtragen"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save} disabled={!count} style={{ flex: 2 }}>
            {count} abhaken
          </button>
        </>
      }
    >
      <p className="hint">Vorgabe ist die Planzeit. Abweichende Uhrzeiten bitte anpassen; was nicht gegeben wurde, abwählen.</p>
      {error ? (
        <p className="hint" style={{ color: "var(--red-text)", fontWeight: 600 }}>
          {error}
        </p>
      ) : null}
      <div className="list">
        {rows.map((r, i) => (
          <label key={r.it.slot} className="li" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={r.on}
              onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
              aria-label={`${r.it.title} abhaken`}
              style={{ width: 22, height: 22, accentColor: "var(--accent)" }}
            />
            <span className="grow">
              <span className="t1" style={{ display: "block" }}>
                {r.it.title}
              </span>
              <span className="t2" style={{ display: "block" }}>
                geplant {r.it.time}
              </span>
            </span>
            <input
              type="time"
              value={r.time}
              onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
              aria-label={`Uhrzeit für ${r.it.title}`}
              style={{ border: "1px solid var(--line-strong)", borderRadius: 10, padding: "8px 6px", background: "var(--surface)", width: 112 }}
            />
          </label>
        ))}
      </div>
    </Sheet>
  );
}

/** Ein Medikament ohne Zeitraum (z. B. noch nicht geliefert) ab einem Tag für eine Anzahl Tage beginnen. */
export function StartSheet({ regimen, onClose }: { regimen: Regimen; onClose: () => void }) {
  const toast = useToast();
  const today = berlinNow().day;
  const [from, setFrom] = useState(today);
  const [days, setDays] = useState("14");
  const [open, setOpen] = useState(false);
  const [dose, setDose] = useState(regimen.unit && /h[uü]b/i.test(regimen.unit) ? "1 Hub" : "");
  const n = parseInt(days, 10);
  const valid = isValidDay(from) && (open || (n >= 1 && n <= 365));
  const to = valid && !open ? addDays(from, n - 1) : null;
  const save = () => {
    if (!valid) return;
    saveRegimen({ ...regimen, steps: [{ from, to, dose: dose.trim() || null, label: null, amount: amountOf(dose, regimen.unit), pattern: "daily" }] });
    toast.show(`${regimen.name} beginnt am ${fmtDMY(from)}`);
    onClose();
  };
  return (
    <Sheet
      title={`${regimen.name} beginnen`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save} disabled={!valid} style={{ flex: 2 }}>
            Beginnen
          </button>
        </>
      }
    >
      {regimen.note ? <p className="hint">{regimen.note}</p> : null}
      <div className="field">
        <label htmlFor="start-from">Erster Tag</label>
        <input id="start-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 200 }} />
      </div>
      <div className="field">
        <label htmlFor="start-days">Dauer in Tagen</label>
        <input id="start-days" type="number" inputMode="numeric" min={1} max={365} value={days} disabled={open} onChange={(e) => setDays(e.target.value)} style={{ maxWidth: 120 }} />
        <label className="row" style={{ gap: 8, fontWeight: 500 }}>
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} /> ohne festes Ende
        </label>
      </div>
      <div className="field">
        <label htmlFor="start-dose">Dosis (erscheint im Titel)</label>
        <input id="start-dose" type="text" value={dose} placeholder="z. B. 1 Hub" onChange={(e) => setDose(e.target.value)} />
      </div>
      <p className="small">
        Uhrzeiten: {(regimen.slots || []).map((sl) => sl.time).join(", ") || "keine"}
        {to ? ` · letzter Tag ${fmtDMY(to)}` : ""}. Ändern lässt sich das unter Mehr → Behandlungsplan.
      </p>
    </Sheet>
  );
}
