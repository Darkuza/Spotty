// Heute: was als Nächstes dran ist, Tagesablauf zum Abhaken, Medikamentenstand.

import { useMemo, useRef, useState } from "react";
import { useChecks, useEntries, usePhotos, usePlan, useProfile, useRegimens, checkItem, uncheckItem, setCheckTime } from "../../lib/data";
import { useNameOf } from "../../lib/session";
import { useSheets, useToast, Sheet, useConfirm } from "../../ui/overlays";
import { Icon } from "../../ui/Icon";
import { AlertBanners, CAT_LABEL, DayNav, Empty, useDayAlerts } from "../common";
import { EntrySheet } from "../entry/EntrySheet";
import { itemState, nextChange, stepFor, stockProjection, fmtAmount, type ItemState } from "@shared/plan.ts";
import { fmtDM, fmtDayShort, minutesOf, type BerlinNow } from "@shared/dates.ts";
import { summarize } from "@shared/entryTypes.ts";
import type { Check, Entry, EntryType, PlanItem, Regimen } from "@shared/types.ts";
import { uploadProtocolPhoto } from "../../lib/photos";
import { clinicPhone } from "../../lib/profile";

type Status = "done" | "now" | "over" | "future" | "past";

function statusOf(st: ItemState, it: PlanItem, day: string, now: BerlinNow): Status {
  if (st.done) return "done";
  if (day < now.day) return "past";
  if (day > now.day) return "future";
  const diff = minutesOf(it.time) - now.minutes;
  if (diff <= -20) return "over";
  if (diff <= 10) return "now";
  return "future";
}

export function TodayView({ day, now, onDay, onGoto }: { day: string; now: BerlinNow; onDay: (d: string) => void; onGoto: (tab: string) => void }) {
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

  const states = useMemo(() => items.map((it) => itemState(it, day, checks, entries, photos)), [items, day, checks, entries, photos]);
  const doneCount = states.filter((s) => s.done).length;
  const isToday = day === now.day;

  const openMeasure = (it: PlanItem, counter = false) => {
    const st = states[items.indexOf(it)];
    const existing = st.done ? (st.ref as Entry) : null;
    sheets.open((close) => <EntrySheet type={(it.measure || "atem") as EntryType} day={day} slot={it.slot} entry={existing} startCounter={counter} onClose={close} />);
  };

  const toggle = (it: PlanItem, st: ItemState) => {
    if (!st.done) {
      // Deutlich verspätet abgehakt: fragen, wann es wirklich gegeben wurde.
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
      return;
    }
    const c = st.ref as Check;
    sheets.open((close) => <CheckSheet item={it} check={c} by={nameOf(c.created_by)} onClose={close} onRemove={async () => {
      const ok = await confirm({ title: "Häkchen entfernen?", text: `${it.title} gilt dann wieder als offen.`, confirm: "Entfernen", danger: true });
      if (ok) {
        uncheckItem(day, it.slot);
        close();
      }
    }} />);
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

  if (!items.length) {
    return (
      <div className="stack">
        <DayNav day={day} today={now.day} onChange={onDay} />
        <div className="card">
          <Empty title="Noch kein Tagesplan">
            <p>Der Behandlungsplan kommt mit dem Import der Akte (Einstellungen → Akte importieren) oder wird unter Einstellungen → Behandlungsplan angelegt.</p>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <DayNav day={day} today={now.day} onChange={onDay} />
      <AlertBanners alerts={alerts} phone={clinicPhone(profile)} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />

      {isToday ? (
        <Hero
          hero={hero}
          next={upcoming.filter((x) => x !== hero).slice(0, 2).map((x) => x.it)}
          now={now}
          onCheck={(it) => toggle(it, { done: false, at: null, by: null, ref: null })}
          onMeasure={openMeasure}
          onPhoto={pickPhoto}
          uploading={uploading}
          allDone={!pending.length}
        />
      ) : (
        <div className="card">
          <div className="row between">
            <b>{day < now.day ? "Rückblick" : "Vorschau"} · {fmtDayShort(day)}</b>
            <span className="muted">
              {doneCount} von {items.length} erledigt
            </span>
          </div>
        </div>
      )}

      {old.length && hero !== old[0] ? (
        <div className="banner warn">
          <div className="head">
            <Icon name="alert" size={20} /> Noch offen
          </div>
          <p>{old.map((x) => `${x.it.time} ${x.it.title}`).join(" · ")}</p>
        </div>
      ) : null}

      <div className="section-title">
        <h2>Tagesablauf</h2>
        <span className="aside num">
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="timeline">
        {items.map((it, i) => {
          const st = states[i];
          const status = statusOf(st, it, day, now);
          const cls = `item${status === "done" ? " done" : status === "now" ? " now" : status === "over" ? " over" : ""}`;
          const who = st.done ? nameOf(st.by) : "";
          return (
            <li key={it.slot} className={cls}>
              <span className="t">{it.time}</span>
              <div className="body">
                <div className={`cat cat-${it.category}`}>{CAT_LABEL[it.category]}</div>
                <div className="title">{it.title}</div>
                {it.detail ? <div className="detail">{it.detail}</div> : null}
                {st.done ? (
                  <div className="meta">
                    {it.kind === "mess"
                      ? `${summarize(st.ref as Entry)} · ${st.at}`
                      : it.kind === "foto"
                        ? `${photos.filter((p) => p.day === day).length} Foto(s) · zuletzt ${st.at}`
                        : `${it.category === "med" ? "gegeben" : "erledigt"} ${st.at}`}
                    {who ? ` · ${who}` : ""}
                  </div>
                ) : null}
              </div>
              {it.kind === "check" ? (
                <button className={`check${st.done ? " on" : ""}`} onClick={() => toggle(it, st)} aria-label={st.done ? `${it.title}: Häkchen bearbeiten` : `${it.title} abhaken`}>
                  <Icon name="check" size={24} stroke={2.4} />
                </button>
              ) : it.kind === "mess" ? (
                <button className="item-action" onClick={() => openMeasure(it, it.measure === "atem" && !st.done)}>
                  {st.done ? "Ändern" : it.measure === "atem" ? "Zählen" : "Eintragen"}
                </button>
              ) : (
                <button className="item-action" onClick={st.done ? () => onGoto("protokoll") : pickPhoto} disabled={uploading}>
                  {uploading ? "Lädt …" : st.done ? "Ansehen" : "Foto"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <MedsCard regimens={regimens} day={now.day} />
    </div>
  );
}

function Hero({ hero, next, now, onCheck, onMeasure, onPhoto, uploading, allDone }: { hero: { it: PlanItem; st: ItemState } | null; next: PlanItem[]; now: BerlinNow; onCheck: (it: PlanItem) => void; onMeasure: (it: PlanItem, counter?: boolean) => void; onPhoto: () => void; uploading: boolean; allDone: boolean }) {
  if (!hero || allDone) {
    return (
      <div className="hero">
        <span className="time">✓</span>
        <span className="eyebrow">Heute</span>
        <span className="title">Alles erledigt</span>
        <p className="detail">Alle Punkte des Tages sind abgehakt oder eingetragen.</p>
      </div>
    );
  }
  const { it } = hero;
  const diff = minutesOf(it.time) - now.minutes;
  const cls = diff <= -20 ? "over" : diff <= 10 ? "due" : "";
  const eyebrow = diff <= -20 ? `Seit ${fmtDiff(-diff)} fällig` : diff <= 0 ? "Jetzt dran" : diff <= 10 ? `In ${diff} Min. dran` : `Als Nächstes · in ${fmtDiff(diff)}`;
  return (
    <section className={`hero ${cls}`} aria-live="polite">
      <span className="time">{it.time}</span>
      <span className="eyebrow">{eyebrow}</span>
      <span className="title">{it.title}</span>
      {it.detail ? <p className="detail">{it.detail}</p> : null}
      <div className="actions">
        {it.kind === "check" ? (
          <button className="btn primary" onClick={() => onCheck(it)}>
            <Icon name="check" size={20} stroke={2.4} /> {it.category === "med" ? "Gegeben" : "Erledigt"}
            {now.minutes - minutesOf(it.time) > 45 ? " …" : ` um ${now.hm}`}
          </button>
        ) : it.kind === "mess" ? (
          <>
            {it.measure === "atem" ? (
              <button className="btn primary" onClick={() => onMeasure(it, true)}>
                Atemzüge zählen
              </button>
            ) : null}
            <button className={`btn ${it.measure === "atem" ? "ghost" : "primary"}`} onClick={() => onMeasure(it, false)}>
              Wert eintragen
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={onPhoto} disabled={uploading}>
            <Icon name="camera" size={20} /> {uploading ? "Wird hochgeladen …" : "Foto aufnehmen"}
          </button>
        )}
      </div>
      {next.length ? (
        <p className="after">
          Danach: {next.map((n) => `${n.time} ${n.title}`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

function fmtDiff(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

function WhenSheet({ item, nowHm, onClose, onPick }: { item: PlanItem; nowHm: string; onClose: () => void; onPick: (time: string) => void }) {
  const [time, setTime] = useState(item.time);
  const verb = item.category === "med" ? "gegeben" : "erledigt";
  return (
    <Sheet title={`Wann ${verb}?`} onClose={onClose}>
      <p>
        <b>{item.title}</b> war für <span className="num">{item.time}</span> geplant.
      </p>
      <div className="grid-2">
        <button className="btn primary" onClick={() => onPick(item.time)}>
          um {item.time}
        </button>
        <button className="btn ghost" onClick={() => onPick(nowHm)}>
          jetzt, {nowHm}
        </button>
      </div>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
        <div className="field grow">
          <label htmlFor="when-time">andere Uhrzeit</label>
          <input id="when-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <button className="btn ghost" onClick={() => time && onPick(time)} disabled={!/^\d{2}:\d{2}$/.test(time)}>
          Übernehmen
        </button>
      </div>
    </Sheet>
  );
}

function CheckSheet({ item, check, by, onClose, onRemove }: { item: PlanItem; check: Check; by: string; onClose: () => void; onRemove: () => void }) {
  const [time, setTime] = useState(check.time);
  const toast = useToast();
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
              if (time !== check.time) {
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
        {item.category === "med" ? "Gegeben" : "Erledigt"} um <b className="num">{check.time}</b>
        {by ? ` von ${by}` : ""}.
      </p>
      <div className="field">
        <label htmlFor="check-time">Uhrzeit korrigieren</label>
        <input id="check-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ maxWidth: 160 }} />
      </div>
      {item.detail ? <p className="hint">{item.detail}</p> : null}
    </Sheet>
  );
}

function MedsCard({ regimens, day }: { regimens: Regimen[]; day: string }) {
  const meds = regimens.filter((r) => r.active && (r.category === "med" || r.category === "inh") && (r.steps || []).length).sort((a, b) => a.sort - b.sort);
  if (!meds.length) return null;
  const now = new Date();
  return (
    <>
      <div className="section-title">
        <h2>Medikamente</h2>
      </div>
      <div className="card flush">
        {meds.map((r) => {
          const cur = stepFor(r, day);
          const nc = nextChange(r, day);
          let stockNote: string | null = null;
          let stockWarn = false;
          if (r.stock != null && r.stock_at) {
            const at = new Date(r.stock_at);
            const atBerlin = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
            const atDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(at);
            const pr = stockProjection(r, Number(r.stock), atDay, minutesOf(atBerlin));
            if (pr.runsOut) {
              stockNote = `Vorrat reicht bis ${fmtDayShort(pr.lastCovered?.day || atDay)} · ${fmtAmount(Math.max(0, -pr.remainingAtEnd))} ${r.unit || ""} fehlen bis Planende`;
              const daysLeft = (new Date(pr.runsOut.day).getTime() - now.getTime()) / 86400000;
              stockWarn = daysLeft < 4;
            } else stockNote = `Vorrat reicht bis Planende (Rest ${fmtAmount(pr.remainingAtEnd)})`;
          }
          return (
            <div key={r.id} className="erow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div>
                <div className="s">
                  {r.name}
                  {cur?.dose ? ` ${cur.dose}` : ""}
                  <span className="muted small">{r.purpose ? ` · ${r.purpose}` : ""}</span>
                </div>
                <div className="x">
                  {cur ? `heute: ${[cur.label, r.slots.map((s) => s.time).join(", ")].filter(Boolean).join(" · ")}` : "heute nicht geplant"}
                  {nc ? ` · ab ${fmtDM(nc.day)} ${nc.step ? `${nc.step.dose || ""} ${nc.step.label || ""}`.trim() : "Ende"}` : ""}
                </div>
                {stockNote ? (
                  <div className="x" style={{ color: stockWarn ? "var(--warn)" : undefined, fontWeight: stockWarn ? 650 : undefined }}>
                    {stockNote}
                  </div>
                ) : null}
                {r.note ? <div className="x">{r.note}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
