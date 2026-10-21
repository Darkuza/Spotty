// Tagesprotokoll: alle Einträge eines Tages mit Uhrzeit und Person, Fotos vom Papierprotokoll,
// Tagesbilanz und Notizen zum Tag.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ackEntry, saveDayNote, useChecks, useDayNotes, useEntries, usePhotos, useProfile, useRegimens } from "../../lib/data";
import { useMe, useMembers, useNameOf } from "../../lib/session";
import { useNowValue } from "../../lib/now";
import { getSeen, markSeen } from "../../lib/seen";
import { isFreshFor, type FreshRow } from "../../lib/fresh";
import { clinicPhone, telHref } from "../../lib/profile";
import { useConfirm, useSheets, useToast, Sheet } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Icon } from "../../ui/Icon";
import { CircleButton, DayStepper, EmptyCard, Group, NavBar, Pill, PromptCard, Row, Screen, SectionHead } from "../../ui/ios";
import { StorageImage } from "../../ui/StorageImage";
import { QUICK_ORDER, TYPES, entryAlert, summarize } from "@shared/entryTypes.ts";
import { dayStats, fluidOfDay, foodOfDay, sortEntries } from "@shared/stats.ts";
import { addDays, berlinOfIso, isValidDay } from "@shared/dates.ts";
import type { Entry, EntryType, Photo } from "@shared/types.ts";
import { extractProtocol, removeProtocolPhoto, uploadProtocolPhoto } from "../../lib/photos";
import { copyText } from "../../lib/files";
import { dayText } from "../../lib/report";
import { IS_DEMO } from "../../lib/config";
import { fmt, fmtDateWd, fmtDayMonthShort } from "../../lib/health/format";
import { NIGHT_STATES } from "../../lib/health/metrics";
import { useDayAlerts } from "../common";
import { EntrySheet } from "../entry/EntrySheet";
import { PhotoViewer } from "./PhotoViewer";
import { ExtractReview } from "./ExtractReview";
import { quickStyle } from "../../lib/health/entryStyle";

export function DayLogPage({ day: dayParam, back }: { day?: string; back: string }) {
  const now = useNowValue();
  const [day, setDay] = useState(dayParam && isValidDay(dayParam) ? dayParam : now.day);
  const entries = useEntries();
  const photos = usePhotos();
  const notes = useDayNotes();
  const regimens = useRegimens();
  const checks = useChecks();
  const members = useMembers();
  const profile = useProfile();
  const nameOf = useNameOf();
  const me = useMe();
  const sheets = useSheets();
  const toast = useToast();
  const confirm = useConfirm();
  const alerts = useDayAlerts(entries, day);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [extracting, setExtracting] = useState<string | null>(null);
  // „Neu“ seit dem letzten Besuch dieser Seite; beim Verlassen gilt alles als gesehen.
  const [since] = useState(() => getSeen());
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") markSeen();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      markSeen();
    };
  }, []);

  const dayEntries = useMemo(() => sortEntries(entries.filter((e) => e.day === day)).reverse(), [entries, day]);
  const dayPhotos = useMemo(() => photos.filter((p) => p.day === day).sort((a, b) => a.time.localeCompare(b.time)), [photos, day]);
  const note = notes.find((n) => n.day === day) || null;
  const st = useMemo(() => dayStats(entries, day, note), [entries, day, note]);
  const isFresh = (r: FreshRow) => isFreshFor(r, me?.user_id, since);
  const freshAll = [...entries.filter(isFresh), ...photos.filter(isFresh)];
  const freshDays = [...new Set(freshAll.map((x) => x.day))].sort().reverse();
  const phone = clinicPhone(profile);
  const label = day === now.day ? `Heute, ${fmtDayMonthShort(day)}` : day === addDays(now.day, -1) ? `Gestern, ${fmtDayMonthShort(day)}` : fmtDateWd(day);

  const open = (type: EntryType, entry?: Entry) => sheets.open((close) => <EntrySheet type={type} day={day} entry={entry || null} startCounter={type === "atem" && !entry} onClose={close} />);
  const chooser = () =>
    sheets.open((close) => (
      <Sheet title="Eintragen" onClose={close}>
        <Group>
          {QUICK_ORDER.map((t) => {
            const s = quickStyle(t);
            return (
              <Row
                key={t}
                glyph={s.glyph}
                color={s.color}
                title={TYPES[t].label}
                chevron
                onClick={() => {
                  close();
                  open(t);
                }}
              />
            );
          })}
        </Group>
      </Sheet>
    ));

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    let ok = 0;
    for (const f of list) {
      try {
        await uploadProtocolPhoto(f, day);
        ok++;
      } catch (e) {
        toast.show(e instanceof Error ? e.message : "Foto konnte nicht hochgeladen werden.", { error: true });
      }
      setUploading((n) => n - 1);
    }
    if (ok) toast.show(ok > 1 ? `${ok} Fotos gespeichert` : "Foto gespeichert");
    if (fileRef.current) fileRef.current.value = "";
  };

  const runExtract = async (p: Photo, closeViewer?: () => void) => {
    setExtracting(p.id);
    try {
      const result = await extractProtocol(p);
      closeViewer?.();
      sheets.open((close) => <ExtractReview photo={p} result={result} onClose={close} />);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Auslesen fehlgeschlagen.", { error: true });
    } finally {
      setExtracting(null);
    }
  };

  const openPhoto = (p: Photo) =>
    sheets.open((close) => (
      <PhotoViewerWrap
        photo={p}
        by={nameOf(p.created_by)}
        onClose={close}
        onExtract={() => void runExtract(p, close)}
        onDelete={async () => {
          const okDel = await confirm({ title: "Foto löschen?", text: "Das Foto wird für alle gelöscht. Bereits übernommene Einträge bleiben erhalten.", confirm: "Löschen", danger: true });
          if (okDel) {
            await removeProtocolPhoto(p);
            close();
            toast.show("Foto gelöscht");
          }
        }}
        extractingId={extracting}
      />
    ));

  const fl = fluidOfDay(st);
  const fo = foodOfDay(st);
  const sinceAt = since ? berlinOfIso(new Date(since).toISOString()) : null;

  return (
    <Screen>
      <NavBar title="Tagesprotokoll" back={back} trailing={<CircleButton icon="plus" label="Eintragen" onClick={chooser} />} />
      <DayStepper day={day} today={now.day} onChange={setDay} label={label} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />

      <div className="pcs">
        {alerts.map((a) => (
          <PromptCard key={a.entry.id} role="alert" label={a.level === "crit" ? "KLINIK ANRUFEN" : "BITTE BEACHTEN"} labelColor={a.level === "crit" ? "var(--red)" : "var(--orange)"} glyph="alert" color={a.level === "crit" ? "var(--red)" : "var(--orange)"} title={`${TYPES[a.entry.type]?.label || "Eintrag"} um ${a.entry.time}`} text={a.text}>
            {a.level === "crit" && phone ? (
              <Pill kind="fill" tone="red" href={telHref(phone)}>
                Anrufen
              </Pill>
            ) : null}
            <Pill onClick={() => ackEntry(a.entry.id)}>Gesehen</Pill>
          </PromptCard>
        ))}
        {sinceAt && freshAll.length ? (
          <PromptCard label="NEU VON DER FAMILIE" glyph="people" color="var(--blue)" title={`${freshAll.length} ${freshAll.length === 1 ? "neuer Eintrag" : "neue Einträge"} seit ${sinceAt.day === now.day ? "" : `${fmtDayMonthShort(sinceAt.day)}, `}${sinceAt.hm} Uhr`} text={freshDays.length === 1 && freshDays[0] === day ? "Unten mit „neu“ markiert." : "Betroffene Tage:"}>
            {freshDays.length > 1 || freshDays[0] !== day
              ? freshDays.map((d) => (
                  <Pill key={d} kind={d === day ? "fill" : "tint"} onClick={() => setDay(d)}>
                    {d === now.day ? "Heute" : fmtDayMonthShort(d)}
                  </Pill>
                ))
              : null}
          </PromptCard>
        ) : null}
      </div>

      <SectionHead title="Einträge" sub={dayEntries.length ? String(dayEntries.length) : undefined} />
      {dayEntries.length ? (
        <Group>
          {dayEntries.map((e) => {
            const s = quickStyle(e.type);
            const a = entryAlert(e);
            const text = (e.data as Record<string, unknown>)?.text;
            const sum = summarize(e);
            const who = nameOf(e.created_by);
            const fresh = isFresh(e);
            return (
              <button key={e.id} type="button" className={`lrow ent2${a && a.level === "crit" ? " crit" : a && a.level === "warn" ? " warn" : ""}`} onClick={() => open(e.type, e)} style={{ "--cat": s.color } as CSSProperties}>
                <span className="row-ic" aria-hidden="true">
                  <Glyph name={s.glyph} size={24} />
                </span>
                <span className="row-t">
                  <span className="row-title">
                    {TYPES[e.type]?.short || e.type}
                    {fresh ? <span className="tagc blue">neu</span> : null}
                  </span>
                  <span className="row-sub">{[sum, typeof text === "string" && sum ? text : !sum && typeof text === "string" ? text : ""].filter(Boolean).join(" · ") || "–"}</span>
                  <span className="row-sub2">{[who, e.source === "foto" ? "vom Foto" : e.source === "import" ? "übernommen" : ""].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="row-v">{e.time}</span>
              </button>
            );
          })}
        </Group>
      ) : (
        <EmptyCard title="Noch keine Einträge">Mit „+“ oben rechts eintragen, etwa Atemzüge, Trinken oder Kot.</EmptyCard>
      )}

      <SectionHead title="Papierprotokoll" sub={dayPhotos.length ? `${dayPhotos.length} ${dayPhotos.length > 1 ? "Fotos" : "Foto"}` : undefined} />
      <div className="card photos-card">
        <div className="photos">
          {dayPhotos.map((p) => (
            <button key={p.id} type="button" className="photo" onClick={() => openPhoto(p)} aria-label={`Foto von ${p.time} öffnen`}>
              <StorageImage bucket="photos" path={p.path} alt={`Protokollfoto ${p.time}`} />
              <span className="cap">
                {p.time}
                {p.extraction ? " · gelesen" : ""}
                {isFresh(p) ? " · neu" : ""}
              </span>
            </button>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`u${i}`} className="photo busy">
              Lädt …
            </div>
          ))}
          <button type="button" className="photo add" onClick={() => fileRef.current?.click()}>
            <Glyph name="camera" size={28} />
            Foto
          </button>
        </div>
        <p className="card-foot">„Mit Claude auslesen“ im Foto überträgt die handschriftlichen Zeilen als Einträge; vor dem Speichern wird jede Zeile angezeigt.{IS_DEMO ? " Im Demo-Modus bleiben Fotos nur bis zum Neuladen." : ""}</p>
      </div>

      <SectionHead title="Tagesbilanz" />
      <Group>
        <Row glyph="drop" color="var(--c-ernaehrung)" title="Getrunken" value={fl.ml != null ? `${fmt(fl.ml)} ml` : "–"} sub={fl.source === "papier" ? "laut Papier" : st.selbstMl ? `davon ${fmt(st.selbstMl)} ml selbst` : undefined} />
        <Row glyph="bowl" color="var(--c-ernaehrung)" title="Gefressen" value={fo.g != null ? `${fmt(fo.g)} g` : st.futterN ? `${st.futterN}×` : "–"} sub={fo.source === "papier" ? "laut Papier" : st.abgelehnt ? `${st.abgelehnt}× abgelehnt` : st.futterOhneMenge.length ? `+ ${st.futterOhneMenge.length}× ohne Gramm` : undefined} />
        <Row glyph="lungs" color="var(--c-atmung)" title="Atemzüge in Ruhe" value={st.atemWert != null ? `${fmt(st.atemWert)}/min` : "–"} sub={st.atem.length ? `Median aus ${st.atem.length} ${st.atem.length === 1 ? "Zählung" : "Zählungen"}` : undefined} />
        {st.spo2Min != null ? <Row glyph="o2" color="var(--c-atmung)" title="SpO₂, niedrigster Wert" value={`${fmt(st.spo2Min)} %`} /> : null}
        <Row glyph="poop" color="var(--c-ausscheidung)" title="Kot" value={st.kot ? `${st.kot}×` : "–"} sub={st.kotAuff ? `${st.kotAuff} auffällig` : undefined} />
        <Row glyph="drop" color="var(--c-ausscheidung)" title="Urin" value={st.urin ? `${st.urin}×` : "–"} sub={st.lastUrin ? `zuletzt ${st.lastUrin}` : undefined} />
        <Row glyph="paw" color="var(--c-bewegung)" title="Gassi" value={st.gassiN ? `${fmt(st.gassiMin)} min` : "–"} />
      </Group>

      <SectionHead title="Notizen zum Tag" />
      <Group>
        <Row
          glyph="moon"
          color="var(--c-schlaf)"
          title="Nacht"
          accessory={
            <select className="row-select" value={note?.nacht || ""} onChange={(e) => saveDayNote(day, { nacht: e.target.value || null })} aria-label="Nacht">
              <option value="">keine Angabe</option>
              {NIGHT_STATES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          }
        />
        <PaperRow key={`ml-${day}`} label="Getrunken laut Papier" unit="ml" value={note?.paper_ml ?? null} onSave={(v) => saveDayNote(day, { paper_ml: v })} />
        <PaperRow key={`g-${day}`} label="Futter laut Papier" unit="g" value={note?.paper_g ?? null} onSave={(v) => saveDayNote(day, { paper_g: v })} />
      </Group>
      <NoteCard key={day} value={note?.note || ""} onSave={(v) => saveDayNote(day, { note: v || null })} />
      <Group>
        <Row
          icon="copy"
          color="var(--blue)"
          title="Tag als Text kopieren"
          tone="blue"
          onClick={async () => {
            const ok = await copyText(dayText({ regimens, checks, entries, photos, days: notes, members }, day));
            toast.show(ok ? "Tag kopiert – zum Einfügen bereit" : "Kopieren nicht möglich", { error: !ok });
          }}
        />
      </Group>
    </Screen>
  );
}

function PhotoViewerWrap(props: { photo: Photo; by: string; onClose: () => void; onExtract: () => void; onDelete: () => void; extractingId: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <PhotoViewer
      photo={props.photo}
      by={props.by}
      onClose={props.onClose}
      onDelete={props.onDelete}
      extracting={busy || props.extractingId === props.photo.id}
      onExtract={() => {
        setBusy(true);
        props.onExtract();
      }}
    />
  );
}

function PaperRow({ label, unit, value, onSave }: { label: string; unit: string; value: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value != null ? String(value) : "");
  return (
    <Row
      title={label}
      accessory={
        <span className="row-num-in">
          <input
            type="text"
            inputMode="numeric"
            value={v}
            onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => {
              const n = v ? parseInt(v, 10) : null;
              if (n !== value) onSave(n);
            }}
            placeholder="–"
            aria-label={`${label} in ${unit}`}
          />
          <span>{unit}</span>
        </span>
      }
    />
  );
}

function NoteCard({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="card note-card">
      <label htmlFor="day-note" className="sr-only">
        Notiz zum Tag
      </label>
      <textarea id="day-note" rows={3} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v.trim())} placeholder="Notiz zum Tag: Was war heute besonders?" />
      <Icon name="edit" size={16} />
    </div>
  );
}
