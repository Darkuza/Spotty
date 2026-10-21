// „Protokollieren“ wie bei den Medikamenten in Health: alle Punkte einer Uhrzeit mit „Ausgelassen“ und „Gegeben“.

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { checkItem, skipItem, uncheckItem, useChecks, useEntries, usePhotos, usePlan, useRegimens } from "../../lib/data";
import { useNameOf } from "../../lib/session";
import { useNowValue } from "../../lib/now";
import { Sheet, useSheets, useToast } from "../../ui/overlays";
import { Glyph } from "../../ui/Glyph";
import { Group, Pill, Segmented } from "../../ui/ios";
import { itemState, type ItemState } from "@shared/plan.ts";
import { fmtDayMid, isValidHm, minutesOf } from "@shared/dates.ts";
import { summarize } from "@shared/entryTypes.ts";
import type { Entry, EntryType, PlanItem } from "@shared/types.ts";
import { earliestFor, fmtDuration } from "../../lib/gaps";
import { uploadProtocolPhoto } from "../../lib/photos";
import { EntrySheet } from "../entry/EntrySheet";
import { doneLabel } from "./actions";
import { itemColor, itemGlyph } from "./planStyle";

type When = "jetzt" | "plan" | "andere";

export function SlotSheet({ day, time, onClose }: { day: string; time: string; onClose: () => void }) {
  const now = useNowValue();
  const all = usePlan(day);
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const regimens = useRegimens();
  const nameOf = useNameOf();
  const sheets = useSheets();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const items = useMemo(() => all.filter((it) => it.time === time), [all, time]);
  const states = useMemo(() => items.map((it) => itemState(it, day, checks, entries, photos)), [items, day, checks, entries, photos]);
  const isToday = day === now.day;
  const late = isToday && now.minutes - minutesOf(time) > 45;
  const [when, setWhen] = useState<When>("jetzt");
  const [other, setOther] = useState(time);
  const stamp = !isToday ? time : when === "plan" ? time : when === "andere" && isValidHm(other) ? other : now.hm;

  const give = (it: PlanItem) => {
    checkItem(day, it.slot, stamp);
    toast.show(`${it.title} · ${stamp}`);
  };
  const skip = (it: PlanItem) => {
    skipItem(day, it.slot, stamp);
    toast.show(`${it.title} ausgelassen`);
  };
  const undo = (it: PlanItem, st: ItemState) => {
    uncheckItem(day, it.slot);
    toast.show(`${it.title}: Häkchen entfernt`, {
      action: { label: "Widerrufen", run: () => (st.skipped ? skipItem(day, it.slot, st.at || stamp) : checkItem(day, it.slot, st.at || stamp)) },
    });
  };
  const measure = (it: PlanItem, st: ItemState) =>
    sheets.open((close) => <EntrySheet type={(it.measure || "atem") as EntryType} day={day} slot={it.slot} entry={st.done && !st.skipped ? (st.ref as Entry) : null} startCounter={it.measure === "atem" && !(st.done && !st.skipped)} onClose={close} />);
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

  const openChecks = items.filter((it, i) => it.kind === "check" && !states[i].done);
  const allGiven = () => {
    for (const it of openChecks) checkItem(day, it.slot, stamp);
    toast.show(`${openChecks.length} Punkte · ${stamp}`);
  };

  return (
    <Sheet title={`${time} Uhr`} onClose={onClose} onDone={onClose} doneLabel="Fertig">
      <p className="sheet-lead center">{isToday ? `Heute, ${fmtDayMid(day).split(", ")[1]}` : fmtDayMid(day)}</p>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
      {late && openChecks.length ? (
        <Group header="Zeitpunkt" footer={when === "andere" ? undefined : `Gilt für alles, was jetzt abgehakt wird. Geplant war ${time} Uhr.`}>
          <div className="grp-pad">
            <Segmented<When>
              label="Zeitpunkt"
              value={when}
              onChange={setWhen}
              options={[
                ["jetzt", `Jetzt, ${now.hm}`],
                ["plan", `Um ${time}`],
                ["andere", "Andere"],
              ]}
            />
            {when === "andere" ? <input className="cap-input wide" type="time" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Uhrzeit" /> : null}
          </div>
        </Group>
      ) : null}
      <Group>
        {items.map((it, i) => {
          const st = states[i];
          const early = it.kind === "check" && !st.done ? earliestFor(regimens, all, day, checks, it) : null;
          const tooEarly = early && isToday && minutesOf(early.at) > now.minutes ? early : null;
          const who = st.done ? nameOf(st.by) : "";
          return (
            <div key={it.slot} className="logrow" style={{ "--cat": itemColor(it) } as CSSProperties}>
              <div className="logrow-top">
                <span className="logrow-ic" aria-hidden="true">
                  <Glyph name={itemGlyph(it)} size={24} />
                </span>
                <span className="logrow-t">
                  <span className="logrow-title">{it.title}</span>
                  {st.done ? (
                    <span className="logrow-sub">
                      {st.skipped ? "Ausgelassen" : it.kind === "mess" ? summarize(st.ref as Entry) : it.kind === "foto" ? "Foto aufgenommen" : doneLabel(it)} · {st.at}
                      {who ? ` · ${who}` : ""}
                    </span>
                  ) : it.detail ? (
                    <span className="logrow-sub">{it.detail}</span>
                  ) : null}
                  {tooEarly ? (
                    <span className="logrow-warn">
                      Frühestens um {tooEarly.at}: laut Plan {fmtDuration(tooEarly.minutes)} Abstand zu {tooEarly.otherName}.
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="logrow-btns">
                {it.kind === "check" ? (
                  <>
                    <button type="button" className={`seg2${st.done && st.skipped ? " on gray" : ""}`} onClick={() => (st.done && st.skipped ? undo(it, st) : skip(it))} aria-pressed={st.done && st.skipped}>
                      Ausgelassen
                    </button>
                    <button type="button" className={`seg2${st.done && !st.skipped ? " on" : ""}`} onClick={() => (st.done && !st.skipped ? undo(it, st) : give(it))} aria-pressed={st.done && !st.skipped}>
                      {doneLabel(it)}
                    </button>
                  </>
                ) : it.kind === "mess" ? (
                  <>
                    <button type="button" className={`seg2${st.done && st.skipped ? " on gray" : ""}`} onClick={() => (st.done && st.skipped ? undo(it, st) : skip(it))} aria-pressed={st.done && st.skipped}>
                      Ausgelassen
                    </button>
                    <button type="button" className={`seg2${st.done && !st.skipped ? " on" : ""}`} onClick={() => measure(it, st)}>
                      {st.done && !st.skipped ? "Ändern" : it.measure === "atem" ? "Zählen" : "Eintragen"}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={`seg2${st.done && st.skipped ? " on gray" : ""}`} onClick={() => (st.done && st.skipped ? undo(it, st) : skip(it))} aria-pressed={st.done && st.skipped}>
                      Ausgelassen
                    </button>
                    <button type="button" className={`seg2${st.done && !st.skipped ? " on" : ""}`} onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? "Lädt …" : st.done && !st.skipped ? "Weiteres Foto" : "Foto aufnehmen"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Group>
      {openChecks.length > 1 ? (
        <div className="sheet-actions">
          <Pill kind="fill" onClick={allGiven}>
            Alle als gegeben markieren
          </Pill>
        </div>
      ) : null}
    </Sheet>
  );
}
