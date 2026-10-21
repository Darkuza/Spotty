// Protokoll: Schnelleinträge, Fotos der Papierprotokolle, Einträge des Tages, Tagesbilanz.

import { useMemo, useRef, useState } from "react";
import { useChecks, useDayNotes, useEntries, usePhotos, useProfile, useRegimens, saveDayNote } from "../../lib/data";
import { useMe, useMembers, useNameOf } from "../../lib/session";
import { useConfirm, useSheets, useToast } from "../../ui/overlays";
import { Icon } from "../../ui/Icon";
import { Chips } from "../../ui/controls";
import { StorageImage } from "../../ui/StorageImage";
import { AlertBanners, DayBar, Empty, HeaderActions, useDayAlerts } from "../common";
import { PageHeader, Section } from "../../ui/Page";
import { ENTRY_STYLE } from "../../ui/kinds";
import { EntrySheet } from "../entry/EntrySheet";
import { PhotoViewer } from "./PhotoViewer";
import { ExtractReview } from "./ExtractReview";
import { QUICK_ORDER, TYPES, entryAlert, fmtNum, summarize } from "@shared/entryTypes.ts";
import { dayStats, fluidOfDay, foodOfDay, sortEntries } from "@shared/stats.ts";
import type { Entry, EntryType, Photo } from "@shared/types.ts";
import { berlinOfIso, fmtDayShort, type BerlinNow } from "@shared/dates.ts";
import { extractProtocol, removeProtocolPhoto, uploadProtocolPhoto } from "../../lib/photos";
import { copyText } from "../../lib/files";
import { dayText } from "../../lib/report";
import { isFreshFor, type FreshRow } from "../../lib/fresh";
import { clinicPhone } from "../../lib/profile";
import { IS_DEMO } from "../../lib/config";

export function LogView({ day, now, onDay, newSince }: { day: string; now: BerlinNow; onDay: (d: string) => void; newSince?: number }) {
  const entries = useEntries();
  const photos = usePhotos();
  const notes = useDayNotes();
  const regimens = useRegimens();
  const checks = useChecks();
  const members = useMembers();
  const profile = useProfile();
  const nameOf = useNameOf();
  const sheets = useSheets();
  const toast = useToast();
  const confirm = useConfirm();
  const alerts = useDayAlerts(entries, day);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [extracting, setExtracting] = useState<string | null>(null);

  const dayEntries = useMemo(() => sortEntries(entries.filter((e) => e.day === day)), [entries, day]);
  const dayPhotos = useMemo(() => photos.filter((p) => p.day === day).sort((a, b) => a.time.localeCompare(b.time)), [photos, day]);
  const note = notes.find((n) => n.day === day) || null;
  const st = useMemo(() => dayStats(entries, day, note), [entries, day, note]);

  const open = (type: EntryType, entry?: Entry) => sheets.open((close) => <EntrySheet type={type} day={day} entry={entry || null} startCounter={type === "atem" && !entry} onClose={close} />);

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

  const quick = (t: EntryType): string => {
    switch (t) {
      case "atem":
        return st.atem.length ? `${fmtNum(st.atem[st.atem.length - 1].bpm)}/min` : "";
      case "spo2":
        return st.spo2.length ? `${fmtNum(st.spo2[st.spo2.length - 1].pct)} %` : "";
      case "trinken":
        return st.trinkenN ? `${fmtNum(st.trinkenMl)} ml` : "";
      case "futter":
        return st.futterN ? (st.futterG ? `${fmtNum(st.futterG)} g` : `${st.futterN}×`) : st.abgelehnt ? "abgelehnt" : "";
      case "kot":
        return st.kot ? `${st.kot}×` : "";
      case "urin":
        return st.urin ? `${st.urin}× · ${st.lastUrin}` : "";
      case "gassi":
        return st.gassiN ? `${fmtNum(st.gassiMin)} min` : "";
      case "husten":
        return st.husten ? `${st.husten}×` : "";
      case "erbrechen":
        return st.erbrechen ? `${st.erbrechen}×` : "";
      case "gewicht":
        return st.kg != null ? `${fmtNum(st.kg, 1)} kg` : "";
      case "med":
        return st.meds.length ? `${st.meds.length}×` : "";
      case "notiz":
        return dayEntries.filter((e) => e.type === "notiz").length ? `${dayEntries.filter((e) => e.type === "notiz").length}×` : "";
    }
  };

  const fl = fluidOfDay(st);
  const fo = foodOfDay(st);

  // Neu seit dem letzten Blick: Einträge und Fotos anderer
  const me = useMe();
  const isFresh = (r: FreshRow) => !!newSince && isFreshFor(r, me?.user_id, newSince);
  const freshEntries = newSince ? entries.filter(isFresh) : [];
  const freshPhotos = newSince ? photos.filter(isFresh) : [];
  const freshDays = [...new Set([...freshEntries, ...freshPhotos].map((x) => x.day))].sort().reverse();
  const freshNames = [...new Set([...freshEntries, ...freshPhotos].map((x) => nameOf(x.created_by)).filter(Boolean))];
  const since = newSince ? berlinOfIso(new Date(newSince).toISOString()) : null;

  return (
    <div className="page">
      <PageHeader title="Protokoll" actions={<HeaderActions />} sub={<DayBar day={day} today={now.day} onChange={onDay} />} />
      <AlertBanners alerts={alerts} phone={clinicPhone(profile)} />
      {since && (freshEntries.length || freshPhotos.length) ? (
        <div className="note col tone-blue blk">
          <div className="note-head">
            Neu seit {since.day === now.day ? "" : `${fmtDayShort(since.day)}, `}
            {since.hm} Uhr
          </div>
          <p className="note-text">
            {[freshEntries.length ? `${freshEntries.length} ${freshEntries.length === 1 ? "Eintrag" : "Einträge"}` : "", freshPhotos.length ? `${freshPhotos.length} ${freshPhotos.length === 1 ? "Foto" : "Fotos"}` : ""].filter(Boolean).join(" und ")}
            {freshNames.length ? ` von ${freshNames.join(", ").replace(/, ([^,]*)$/, " und $1")}` : ""}
            {freshDays.length === 1 && freshDays[0] === day ? ", unten mit „neu“ markiert." : "."}
          </p>
          {freshDays.some((d) => d !== day) ? (
            <div className="fresh-days">
              {freshDays.map((d) => (
                <button key={d} className="btn small" aria-pressed={d === day} onClick={() => onDay(d)}>
                  {d === now.day ? "Heute" : fmtDayShort(d)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Section title="Eintragen" first>
        <div className="qgrid">
          {QUICK_ORDER.map((t) => {
            const hasAlert = dayEntries.some((e) => e.type === t && !e.ack && entryAlert(e)?.level === "crit");
            const ks = ENTRY_STYLE[t];
            const val = quick(t);
            return (
              <button key={t} className={`qbtn${hasAlert ? " alert" : ""}`} onClick={() => open(t)}>
                <span className={`ico sm k-${ks.kind}`} aria-hidden="true">
                  <Icon name={ks.icon} size={17} stroke={2} />
                </span>
                <b>{TYPES[t].short}</b>
                <span className={`qv${val ? "" : " none"}`}>{val || "+"}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Tagesbilanz">
        <div className="card">
          <div className="bilanz">
            <div>
              <b className={fl.ml != null ? "" : "none"}>{fl.ml != null ? fmtNum(fl.ml) : "–"}</b>
              <span>ml getrunken{fl.source === "papier" ? " (Papier)" : st.selbstMl ? `, ${fmtNum(st.selbstMl)} selbst` : ""}</span>
            </div>
            <div>
              <b className={fo.g != null ? "" : "none"}>{fo.g != null ? fmtNum(fo.g) : "–"}</b>
              <span>g Futter{fo.source === "papier" ? " (Papier)" : st.futterOhneMenge.length ? ` + ${st.futterOhneMenge.length}× ohne g` : ""}</span>
            </div>
            <div>
              <b className={st.atemWert != null ? "" : "none"}>{st.atemWert != null ? fmtNum(st.atemWert) : "–"}</b>
              <span>Atemzüge/min, Median</span>
            </div>
            <div>
              <b className={st.kot ? "" : "none"}>{st.kot || "–"}</b>
              <span>× Kot{st.kotAuff ? `, ${st.kotAuff} auffällig` : ""}</span>
            </div>
            <div>
              <b className={st.urin ? "" : "none"}>{st.urin || "–"}</b>
              <span>× Urin{st.lastUrin ? `, zuletzt ${st.lastUrin}` : ""}</span>
            </div>
            <div>
              <b className={st.gassiN ? "" : "none"}>{st.gassiN ? fmtNum(st.gassiMin) : "–"}</b>
              <span>min Gassi{st.spo2Min != null ? ` · SpO₂ min ${fmtNum(st.spo2Min)} %` : ""}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Papierprotokoll" aside={dayPhotos.length ? `${dayPhotos.length} ${dayPhotos.length > 1 ? "Fotos" : "Foto"}` : undefined}>
        <div className="card stack-s">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
          <div className="photos">
            {dayPhotos.map((p) => (
              <button key={p.id} className="photo" onClick={() => openPhoto(p)} aria-label={`Foto von ${p.time} öffnen`}>
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
                Wird hochgeladen …
              </div>
            ))}
            <button className="photo add" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={26} />
              Foto hinzufügen
            </button>
          </div>
          <p className="hint">
            Fotos gehören zum oben gewählten Tag. „Mit Claude auslesen“ überträgt die handschriftlichen Zeilen als Einträge; vor dem Speichern wird jede Zeile angezeigt.
            {IS_DEMO ? " Im Demo-Modus bleiben Fotos nur bis zum Neuladen." : ""}
          </p>
        </div>
      </Section>

      <Section title="Einträge" aside={dayEntries.length ? String(dayEntries.length) : undefined}>
        {dayEntries.length ? (
          <div className="ents">
            {dayEntries.map((e) => {
              const a = entryAlert(e);
              const text = (e.data as Record<string, unknown>)?.text;
              const ks = ENTRY_STYLE[e.type] || ENTRY_STYLE.notiz;
              const sum = summarize(e);
              return (
                <button key={e.id} className={`ent${a && a.level !== "info" ? ` ${a.level}` : ""}`} onClick={() => open(e.type, e)}>
                  <span className="tm">{e.time}</span>
                  <span className={`dot d-${ks.kind}`} aria-hidden="true" />
                  <span style={{ minWidth: 0 }}>
                    <span className={`ty x-${ks.kind}`}>
                      {TYPES[e.type]?.short || e.type}
                      {e.source === "foto" ? <span className="t2" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>vom Foto</span> : e.source === "import" ? <span className="t2" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>übernommen</span> : null}
                      {isFresh(e) ? <span className="tag new">neu</span> : null}
                    </span>
                    <span className="tx" style={{ display: "block" }}>
                      {sum || (text ? String(text) : "–")}
                    </span>
                    {text && sum ? (
                      <span className="mx" style={{ display: "block" }}>
                        {String(text)}
                      </span>
                    ) : null}
                  </span>
                  <span className="who">{nameOf(e.created_by)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <Empty title="Noch keine Einträge">
              <p>Oben eine Kachel antippen, z. B. „Atemzüge“ zum Zählen oder „Trinken“ für eine Spritze Wasser.</p>
            </Empty>
          </div>
        )}
      </Section>

      <Section title="Notizen zum Tag">
        <div className="card stack">
          <div className="field">
            <span className="label">Nacht</span>
            <Chips options={["ruhig", "unruhig", "sehr unruhig"]} value={note?.nacht || null} onChange={(v) => saveDayNote(day, { nacht: v })} />
          </div>
          <div className="grid-2">
            <PaperField label="Getrunken laut Papier (ml)" value={note?.paper_ml ?? null} onSave={(v) => saveDayNote(day, { paper_ml: v })} />
            <PaperField label="Futter laut Papier (g)" value={note?.paper_g ?? null} onSave={(v) => saveDayNote(day, { paper_g: v })} />
          </div>
          <NoteField key={day} value={note?.note || ""} onSave={(v) => saveDayNote(day, { note: v || null })} />
          <button
            className="btn"
            onClick={async () => {
              const ok = await copyText(dayText({ regimens, checks, entries, photos, days: notes, members }, day));
              toast.show(ok ? "Tag kopiert – zum Einfügen bereit" : "Kopieren nicht möglich", { error: !ok });
            }}
          >
            <Icon name="copy" size={20} /> Tag als Text kopieren
          </button>
        </div>
      </Section>
    </div>
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

function PaperField({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value != null ? String(value) : "");
  return (
    <div className="field">
      <label>{label}</label>
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
      />
    </div>
  );
}

function NoteField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="field">
      <label htmlFor="day-note">Notiz zum Tag</label>
      <textarea id="day-note" rows={3} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v.trim())} placeholder="Was war heute besonders?" />
    </div>
  );
}
