// Einfache Ansicht der Übersicht: nur der nächste Schritt mit großer Taste, ein Tipp für das Befinden,
// der Tagesablauf nach Tageszeit und Foto vom Papierprotokoll statt Eintippen.

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useChecks, useEntries, usePhotos, usePlan, useProfile, saveEntry } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { useSheets, useToast } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Icon } from "../../ui/Icon";
import { Avatar, CircleButton, Group, NavBar, Row, Screen, SectionHead } from "../../ui/ios";
import { EntrySheet } from "../entry/EntrySheet";
import { EmergencySheet } from "../EmergencySheet";
import { ProfileHub } from "../profile/ProfileHub";
import { fmtDiff, useCheckActions } from "../plan/actions";
import { itemColor, itemGlyph } from "../plan/planStyle";
import { StatusLine } from "../summary/SummaryView";
import { itemState, type ItemState } from "@shared/plan.ts";
import { fmtDayMid, minutesOf } from "@shared/dates.ts";
import { BEFINDEN_OPTS, summarize } from "@shared/entryTypes.ts";
import type { EntryType, PlanItem } from "@shared/types.ts";
import { uploadProtocolPhoto } from "../../lib/photos";
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

const MOOD_COLOR: Record<string, string> = { gut: "var(--green)", unsicher: "var(--orange)", schlecht: "var(--red)" };

export function SimpleToday() {
  const now = useNowValue();
  const day = now.day;
  const items = usePlan(day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const profile = useProfile();
  const sheets = useSheets();
  const toast = useToast();
  const { give, skip } = useCheckActions(day, now);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [openPart, setOpenPart] = useState<Part | "none" | null>(null);
  const name = profile?.data?.name || "Spotty";

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
    <Screen className="simple">
      <NavBar
        title="Heute"
        large
        trailing={
          <>
            <CircleButton glyph="phone" tone="red" label="Notfall" onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} />
            <Avatar name={name} onClick={() => sheets.open((close) => <ProfileHub onClose={close} />)} />
          </>
        }
        largeExtra={
          <>
            <p className="lt-sub">{fmtDayMid(day)} · einfache Ansicht</p>
            <StatusLine />
          </>
        }
      />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />

      {hero ? <SimpleHero hero={hero} now={now} onAct={act} onLater={later} onSkip={skip} uploading={uploading} /> : <AllDone hasPlan={items.length > 0} />}

      <SectionHead title="Wie geht es Spotty?" />
      <div className="card mood-card">
        <div className="mood" role="group" aria-label="Befinden">
          {BEFINDEN_OPTS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={(lastMood?.data as Record<string, unknown> | undefined)?.befinden === v} onClick={() => mood(v)} style={{ "--m": MOOD_COLOR[v] } as CSSProperties}>
              <i aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <p className="mood-x">{lastMood ? `Zuletzt um ${lastMood.time}: ${summarize(lastMood).replace(/^Befinden /, "")}.` : "Ein Tipp genügt. Die Familie sieht es sofort; bei „schlecht“ erscheinen die Warnzeichen."}</p>
      </div>

      {items.length ? (
        <>
          <SectionHead title="Tagesablauf" />
          {PARTS.map(([part, label]) => {
            const rows = items.map((it, i) => ({ it, st: states[i] })).filter((x) => partOf(x.it.time) === part);
            if (!rows.length) return null;
            const done = rows.filter((x) => x.st.done).length;
            const open = shownPart === part;
            return (
              <Group key={part}>
                <Row title={label} sub={`${rows.length} ${rows.length === 1 ? "Punkt" : "Punkte"}${done ? `, ${done} erledigt` : ""}`} onClick={() => setOpenPart(open ? "none" : part)} accessory={<span className={`acc-chev${open ? " open" : ""}`}><Icon name="down" size={17} stroke={2.6} /></span>} />
                {open ? rows.map((x) => <SimpleRow key={x.it.slot} it={x.it} st={x.st} current={x.it.slot === hero?.it.slot} onAct={() => act(x.it)} />) : null}
              </Group>
            );
          })}
        </>
      ) : null}

      <SectionHead title="Schnell festhalten" />
      <div className="qlog big">
        <button type="button" className="qtile" style={{ "--cat": "var(--c-andere)" } as CSSProperties} onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Glyph name="camera" size={32} />
          <span>{uploading ? "Lädt …" : "Zettel fotografieren"}</span>
        </button>
        <button type="button" className="qtile" style={{ "--cat": "var(--c-atmung)" } as CSSProperties} onClick={() => measure("atem", undefined, true)}>
          <Glyph name="lungs" size={32} />
          <span>Atemzüge zählen</span>
        </button>
      </div>

      <Group>
        <Row title="Ausführliche Ansicht öffnen" tone="blue" onClick={() => setViewMode("voll")} />
      </Group>
    </Screen>
  );
}

function SimpleHero({ hero, now, onAct, onLater, onSkip, uploading }: { hero: { it: PlanItem; st: ItemState }; now: { minutes: number }; onAct: (it: PlanItem) => void; onLater: (it: PlanItem) => void; onSkip: (it: PlanItem) => void; uploading: boolean }) {
  const { it } = hero;
  const diff = minutesOf(it.time) - now.minutes;
  const eyebrow = diff <= -20 ? `Seit ${fmtDiff(-diff)} fällig · ${it.time}` : diff <= 10 ? `Jetzt dran · ${it.time}` : `Als Nächstes · ${it.time}`;
  const label = it.kind === "check" ? (it.category === "med" ? "Gegeben" : "Erledigt") : it.kind === "mess" ? (it.measure === "atem" ? "Atemzüge zählen" : "Wert eintragen") : uploading ? "Wird hochgeladen …" : "Foto aufnehmen";
  return (
    <section className="shero" style={{ "--cat": itemColor(it) } as CSSProperties} aria-label="Jetzt dran">
      <div className="shero-top">
        <span className={`shero-lab${diff <= -20 ? " late" : ""}`}>{eyebrow}</span>
        <span className="shero-ic" aria-hidden="true">
          <Glyph name={itemGlyph(it)} size={30} />
        </span>
      </div>
      <p className="shero-title">{it.title}</p>
      {it.detail ? <p className="shero-x">{it.detail}</p> : null}
      <button type="button" className="pill fill xl" onClick={() => onAct(it)} disabled={it.kind === "foto" && uploading}>
        {it.kind === "check" ? <Icon name="check" size={24} stroke={2.8} /> : null}
        {label}
      </button>
      <div className="shero-row">
        <button type="button" className="pill gray lg" onClick={() => onLater(it)}>
          In {SNOOZE_MIN} Minuten
        </button>
        <button type="button" className="pill gray lg" onClick={() => onSkip(it)}>
          Ging nicht
        </button>
      </div>
    </section>
  );
}

function AllDone({ hasPlan }: { hasPlan: boolean }) {
  return (
    <section className="shero done" aria-label="Erledigt">
      <span className="shero-ok" aria-hidden="true">
        <Glyph name="checklist" size={44} />
      </span>
      <p className="shero-title">{hasPlan ? "Alles erledigt" : "Kein Tagesplan"}</p>
      <p className="shero-x">{hasPlan ? "Für heute ist nichts mehr offen." : "Für heute ist nichts geplant."}</p>
    </section>
  );
}

function SimpleRow({ it, st, current, onAct }: { it: PlanItem; st: ItemState; current: boolean; onAct: () => void }) {
  return (
    <div className={`lrow slot-row${st.done ? (st.skipped ? " skipped" : " done") : current ? " now" : ""}`} style={{ "--cat": itemColor(it) } as CSSProperties}>
      <span className="row-ic" aria-hidden="true">
        <Glyph name={itemGlyph(it)} size={24} />
      </span>
      <span className="row-t">
        <span className="row-title">
          {it.time} · {it.title}
        </span>
        {st.done ? <span className="row-sub">{st.skipped ? `ging nicht · ${st.at}` : `erledigt ${st.at}`}</span> : null}
      </span>
      {st.done ? (
        <span className={`slot-mark${st.skipped ? " skip" : " on"}`} aria-label={st.skipped ? "ging nicht" : "erledigt"} role="img">
          {st.skipped ? <span className="dash" /> : <Glyph name="checklist" size={22} />}
        </span>
      ) : (
        <button type="button" className="slot-mark btn-mark" onClick={onAct} aria-label={`${it.title} ${it.kind === "check" ? "abhaken" : "eintragen"}`} />
      )}
    </div>
  );
}
