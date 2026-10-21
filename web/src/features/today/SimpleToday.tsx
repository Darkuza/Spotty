// Einfache Ansicht für „Heute“: nur der nächste Schritt mit großer Taste, ein Tipp für das Befinden,
// der Tagesablauf nach Tageszeit und Foto vom Papierprotokoll statt Eintippen.

import { useMemo, useRef, useState } from "react";
import { useChecks, useEntries, usePhotos, usePlan, useProfile, saveEntry } from "../../lib/data";
import { useSheets, useToast } from "../../ui/overlays";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/Page";
import { categoryStyle } from "../../ui/kinds";
import { AlertBanners, useDayAlerts } from "../common";
import { EntrySheet } from "../entry/EntrySheet";
import { EmergencySheet } from "../EmergencySheet";
import { fmtDiff, useCheckActions } from "./TodayView";
import { itemState, type ItemState } from "@shared/plan.ts";
import { fmtDayMid, minutesOf, type BerlinNow } from "@shared/dates.ts";
import { BEFINDEN_OPTS, summarize } from "@shared/entryTypes.ts";
import type { EntryType, PlanItem } from "@shared/types.ts";
import { uploadProtocolPhoto } from "../../lib/photos";
import { clinicPhone } from "../../lib/profile";
import { setViewMode } from "../../lib/viewMode";

const SNOOZE_MIN = 15;

type Part = "morgen" | "mittag" | "abend";
const PARTS: [Part, string][] = [
  ["morgen", "Morgen"],
  ["mittag", "Mittag und Nachmittag"],
  ["abend", "Abend"],
];
function partOf(time: string): Part {
  const m = minutesOf(time);
  if (m < 12 * 60) return "morgen";
  if (m < 17 * 60) return "mittag";
  return "abend";
}

const MOOD_COLOR: Record<string, string> = { gut: "var(--accent)", unsicher: "var(--amber)", schlecht: "var(--red)" };

export function SimpleToday({ now }: { now: BerlinNow }) {
  const day = now.day;
  const items = usePlan(day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const profile = useProfile();
  const sheets = useSheets();
  const toast = useToast();
  const alerts = useDayAlerts(entries, day);
  const { give, skip } = useCheckActions(day, now);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [openPart, setOpenPart] = useState<Part | "none" | null>(null);

  const states = useMemo(() => items.map((it) => itemState(it, day, checks, entries, photos)), [items, day, checks, entries, photos]);
  const pending = items.map((it, i) => ({ it, st: states[i] })).filter((x) => !x.st.done);
  const awake = pending.filter((x) => !(snoozed[x.it.slot] && snoozed[x.it.slot] > now.minutes));
  const hero = awake.find((x) => minutesOf(x.it.time) >= now.minutes - 60) || awake[0] || null;
  const heroPart = hero ? partOf(hero.it.time) : partOf(now.hm);
  const shownPart = openPart === null ? heroPart : openPart;
  const lastMood = useMemo(() => [...entries].filter((e) => e.day === day && e.type === "notiz" && (e.data as Record<string, unknown>)?.befinden).sort((a, b) => b.time.localeCompare(a.time))[0] || null, [entries, day]);

  const measure = (type: EntryType, it?: PlanItem, counter = false) => sheets.open((close) => <EntrySheet type={type} day={day} slot={it?.slot} startCounter={counter} onClose={close} />);

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

  const act = (it: PlanItem) => {
    if (it.kind === "check") give(it);
    else if (it.kind === "mess") measure((it.measure || "atem") as EntryType, it, it.measure === "atem");
    else fileRef.current?.click();
  };

  const later = (it: PlanItem) => {
    setSnoozed((s) => ({ ...s, [it.slot]: now.minutes + SNOOZE_MIN }));
    toast.show(`${it.title} kommt in ${SNOOZE_MIN} Minuten wieder`);
  };

  const mood = (v: string) => {
    saveEntry({ type: "notiz", day, time: now.hm, data: { befinden: v } });
    const label = BEFINDEN_OPTS.find((o) => o[0] === v)?.[1] || v;
    toast.show(`Befinden „${label}“ gespeichert`);
    if (v === "schlecht") sheets.open((close) => <EmergencySheet onClose={close} />);
  };

  return (
    <div className="page simple">
      <PageHeader
        title="Heute"
        actions={
          <button type="button" className="ib sos" onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} aria-label="Notfall">
            <Icon name="phone" size={22} stroke={1.9} />
          </button>
        }
        sub={<span>{fmtDayMid(day)} · einfache Ansicht</span>}
      />
      <AlertBanners alerts={alerts} phone={clinicPhone(profile)} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />

      <section className="blk" aria-label="Jetzt dran">
        {hero ? <SimpleHero hero={hero} now={now} onAct={act} onLater={later} onSkip={skip} uploading={uploading} /> : <AllDone hasPlan={items.length > 0} />}
      </section>

      <section className="blk-l stack-s" aria-label="Wie geht es Spotty">
        <p className="t1">Wie geht es Spotty gerade?</p>
        <div className="mood" role="group" aria-label="Befinden">
          {BEFINDEN_OPTS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={(lastMood?.data as Record<string, unknown> | undefined)?.befinden === v} onClick={() => mood(v)}>
              <i style={{ background: MOOD_COLOR[v] }} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <p className="t2">{lastMood ? `Zuletzt um ${lastMood.time}: ${summarize(lastMood).replace(/^Befinden /, "")}.` : "Ein Tipp genügt. Die Familie sieht es sofort; bei „schlecht“ erscheinen die Warnzeichen."}</p>
      </section>

      {items.length ? (
        <section className="blk-l stack-s" aria-label="Tagesablauf">
          <p className="t1">Tagesablauf</p>
          <div className="list plan">
            {PARTS.map(([part, label]) => {
              const rows = items.map((it, i) => ({ it, st: states[i] })).filter((x) => partOf(x.it.time) === part);
              if (!rows.length) return null;
              const done = rows.filter((x) => x.st.done).length;
              const open = shownPart === part;
              return (
                <div key={part}>
                  <button type="button" className="grp-btn" aria-expanded={open} onClick={() => setOpenPart(open ? "none" : part)}>
                    <span>
                      {label} · {rows.length} {rows.length === 1 ? "Punkt" : "Punkte"}
                      {done ? <span className="t2">{`, ${done} erledigt`}</span> : null}
                    </span>
                    <span className="chev" aria-hidden="true">
                      <Icon name="down" size={18} stroke={2.2} />
                    </span>
                  </button>
                  {open ? rows.map((x) => <SimpleRow key={x.it.slot} it={x.it} st={x.st} current={x.it.slot === hero?.it.slot} onAct={() => act(x.it)} />) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="blk-l stack-s" aria-label="Schnell festhalten">
        <p className="t1">Schnell festhalten</p>
        <button type="button" className="big-act" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <span className="ico lg k-claude" aria-hidden="true">
            <Icon name="camera" size={22} stroke={1.9} />
          </span>
          <span className="grow">
            <span className="t1" style={{ display: "block" }}>
              {uploading ? "Foto wird hochgeladen …" : "Zettel fotografieren"}
            </span>
            <span className="t2" style={{ display: "block" }}>
              Claude kann das Papierprotokoll danach übertragen
            </span>
          </span>
        </button>
        <button type="button" className="big-act" onClick={() => measure("atem", undefined, true)}>
          <span className="ico lg k-mess" aria-hidden="true">
            <Icon name="lungs" size={22} stroke={2} />
          </span>
          <span className="grow">
            <span className="t1" style={{ display: "block" }}>
              Atemzüge zählen
            </span>
            <span className="t2" style={{ display: "block" }}>
              30 Sekunden auf den Kreis tippen
            </span>
          </span>
        </button>
      </section>

      <div className="blk-l">
        <button type="button" className="link-btn" style={{ fontSize: 16 }} onClick={() => setViewMode("voll")}>
          Ausführliche Ansicht öffnen
        </button>
      </div>
    </div>
  );
}

function SimpleHero({ hero, now, onAct, onLater, onSkip, uploading }: { hero: { it: PlanItem; st: ItemState }; now: BerlinNow; onAct: (it: PlanItem) => void; onLater: (it: PlanItem) => void; onSkip: (it: PlanItem) => void; uploading: boolean }) {
  const { it } = hero;
  const diff = minutesOf(it.time) - now.minutes;
  const eyebrow = diff <= -20 ? `Seit ${fmtDiff(-diff)} fällig · ${it.time}` : diff <= 10 ? `Jetzt dran · ${it.time}` : `Als Nächstes · ${it.time}`;
  const ks = categoryStyle(it.category, it.measure);
  const label = it.kind === "check" ? (it.category === "med" ? "Gegeben" : "Erledigt") : it.kind === "mess" ? (it.measure === "atem" ? "Atemzüge zählen" : "Wert eintragen") : uploading ? "Wird hochgeladen …" : "Foto aufnehmen";
  return (
    <div className={`hero${diff <= -20 ? " over" : diff <= 10 ? " due" : ""}`}>
      <div className="hero-top">
        <span className="lab">{eyebrow}</span>
        <span className={`ico sm k-${ks.kind}`} aria-hidden="true">
          <Icon name={ks.icon} size={17} stroke={2} />
        </span>
      </div>
      <div className="stack-s" style={{ gap: 6 }}>
        <p className="hero-title">{it.title}</p>
        {it.detail ? (
          <p className="t2" style={{ fontSize: 16, lineHeight: "23px" }}>
            {it.detail}
          </p>
        ) : null}
      </div>
      <button type="button" className="btn primary xl" onClick={() => onAct(it)} disabled={it.kind === "foto" && uploading}>
        {it.kind === "check" ? <Icon name="check" size={24} stroke={2.6} /> : it.kind === "foto" ? <Icon name="camera" size={22} /> : null}
        {label}
      </button>
      <div className="btn-row">
        <button type="button" className="btn" style={{ minHeight: 48 }} onClick={() => onLater(it)}>
          In {SNOOZE_MIN} Minuten
        </button>
        <button type="button" className="btn" style={{ minHeight: 48 }} onClick={() => onSkip(it)}>
          Ging nicht
        </button>
      </div>
    </div>
  );
}

function AllDone({ hasPlan }: { hasPlan: boolean }) {
  return (
    <div className="hero">
      <div className="hero-main">
        <span className="hero-time done" aria-hidden="true">
          <Icon name="check" size={44} stroke={2.6} />
        </span>
        <div className="hero-body">
          <p className="hero-title">{hasPlan ? "Alles erledigt" : "Kein Tagesplan"}</p>
          <p className="t2">{hasPlan ? "Für heute ist nichts mehr offen." : "Für heute ist nichts geplant."}</p>
        </div>
      </div>
    </div>
  );
}

function SimpleRow({ it, st, current, onAct }: { it: PlanItem; st: ItemState; current: boolean; onAct: () => void }) {
  const ks = categoryStyle(it.category, it.measure);
  return (
    <div className={`li${st.done ? (st.skipped ? " skip" : " done") : current ? " now" : ""}`}>
      <span className="pt">{it.time}</span>
      <span className={`ico sm k-${ks.kind}`} aria-hidden="true">
        <Icon name={ks.icon} size={17} stroke={2} />
      </span>
      <div className="pbody">
        <span className="t1">{it.title}</span>
        {st.done ? <span className={`pmeta${st.skipped ? " skip" : ""}`}>{st.skipped ? `ging nicht · ${st.at}` : `erledigt ${st.at}`}</span> : null}
      </div>
      <div className="pctl">
        {st.done ? (
          <span className={`check${st.skipped ? " skip" : " on"}`} aria-label={st.skipped ? "ging nicht" : "erledigt"} role="img">
            <Icon name={st.skipped ? "minus" : "check"} size={20} stroke={2.6} />
          </span>
        ) : (
          <button type="button" className="check" onClick={onAct} aria-label={`${it.title} ${it.kind === "check" ? "abhaken" : "eintragen"}`}>
            <Icon name="check" size={20} stroke={2.6} />
          </button>
        )}
      </div>
    </div>
  );
}

