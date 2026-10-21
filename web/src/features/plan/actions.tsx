// Abhaken und Auslassen von Planpunkten mit allen Rückfragen: Wann gegeben? Häkchen ändern, Nachtragen, Beginnen.

import { useState } from "react";
import { checkItem, saveRegimen, setCheckTime, skipItem, uncheckItem } from "../../lib/data";
import { Sheet, useToast } from "../../ui/overlays";
import { Group, Row } from "../../ui/ios";
import { addDays, berlinNow, fmtDMY, isValidDay, isValidHm, minutesOf, type BerlinNow } from "@shared/dates.ts";
import type { Check, PlanItem, Regimen } from "@shared/types.ts";
import { store } from "../../lib/store";
import { amountOf } from "../../lib/dose";
import { useSheets } from "../../ui/overlays";

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

export function doneLabel(it: PlanItem): string {
  return it.category === "med" ? "Gegeben" : "Erledigt";
}

/** Abhaken mit Rückfrage bei deutlicher Verspätung; gemeinsam für alle Ansichten. */
export function useCheckActions(day: string, now: BerlinNow) {
  const sheets = useSheets();
  const toast = useToast();
  const isToday = day === now.day;
  const give = (it: PlanItem, opts: { ask?: boolean } = {}) => {
    if ((opts.ask ?? true) && isToday && now.minutes - minutesOf(it.time) > 45) {
      sheets.open((close) => (
        <WhenSheet
          item={it}
          nowHm={now.hm}
          onClose={close}
          onPick={(time) => {
            checkItem(day, it.slot, time);
            toast.show(`${it.title} · ${time}`, { action: { label: "Widerrufen", run: () => uncheckItem(day, it.slot) } });
            close();
          }}
        />
      ));
      return;
    }
    const time = isToday ? now.hm : it.time;
    checkItem(day, it.slot, time);
    toast.show(`${it.title} · ${time}`, { action: { label: "Widerrufen", run: () => uncheckItem(day, it.slot) } });
  };
  const skip = (it: PlanItem) => {
    skipItem(day, it.slot, isToday ? now.hm : it.time);
    toast.show(`${it.title} ausgelassen`, { action: { label: "Widerrufen", run: () => uncheckItem(day, it.slot) } });
  };
  return { give, skip };
}

export function WhenSheet({ item, nowHm, onClose, onPick }: { item: PlanItem; nowHm: string; onClose: () => void; onPick: (time: string) => void }) {
  const [time, setTime] = useState(item.time);
  const verb = doneVerb(item);
  return (
    <Sheet title={`Wann ${verb}?`} onClose={onClose} onDone={() => isValidHm(time) && onPick(time)} doneDisabled={!isValidHm(time)} doneLabel="Übernehmen">
      <p className="sheet-lead">
        <b>{item.title}</b> war für {item.time} Uhr geplant.
      </p>
      <Group>
        <Row title={`Um ${item.time} Uhr, wie geplant`} onClick={() => onPick(item.time)} tone="blue" />
        <Row title={`Jetzt, ${nowHm} Uhr`} onClick={() => onPick(nowHm)} tone="blue" />
      </Group>
      <Group header="Andere Uhrzeit">
        <Row title="Uhrzeit" accessory={<input className="cap-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Andere Uhrzeit" />} />
      </Group>
    </Sheet>
  );
}

/** Erledigten oder ausgelassenen Punkt ändern: Uhrzeit, Ausgelassen/Gegeben, Häkchen entfernen. */
export function CheckSheet({ item, check, by, onClose, onRemove }: { item: PlanItem; check: Check; by: string; onClose: () => void; onRemove: () => void }) {
  const [time, setTime] = useState(check.time);
  const toast = useToast();
  const skipped = !!check.skipped;
  const done = () => {
    if (time !== check.time && isValidHm(time)) {
      setCheckTime(check.day, check.slot, time);
      toast.show(`Uhrzeit auf ${time} geändert`);
    }
    onClose();
  };
  return (
    <Sheet title={item.title} onClose={onClose} onDone={done} doneLabel="Fertig">
      <p className="sheet-lead">
        {skipped ? "Ausgelassen" : doneLabel(item)} um {check.time} Uhr{by ? ` von ${by}` : ""}.
        {check.note ? ` ${check.note.charAt(0).toUpperCase()}${check.note.slice(1)}${/[.!?]$/.test(check.note) ? "" : "."}` : ""}
      </p>
      <Group>
        <Row title="Uhrzeit" accessory={<input className="cap-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Uhrzeit korrigieren" />} />
      </Group>
      <Group footer={item.detail || undefined}>
        <Row
          title={skipped ? `Doch ${doneVerb(item)}` : "Als ausgelassen markieren"}
          tone="blue"
          onClick={() => {
            if (skipped) checkItem(check.day, check.slot, isValidHm(time) ? time : check.time);
            else skipItem(check.day, check.slot, isValidHm(time) ? time : check.time);
            toast.show(skipped ? `${item.title}: doch ${doneVerb(item)}` : `${item.title}: als ausgelassen markiert`);
            onClose();
          }}
        />
        <Row title="Häkchen entfernen" tone="red" onClick={onRemove} />
      </Group>
    </Sheet>
  );
}

/** Mehrere verpasste Punkte auf einmal abhaken, jeweils mit der tatsächlichen Uhrzeit. */
export function CatchUpSheet({ day, items, onClose }: { day: string; items: PlanItem[]; onClose: () => void }) {
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
    <Sheet title="Nachtragen" onClose={onClose} onDone={save} doneDisabled={!count} doneLabel={`${count} abhaken`}>
      <p className="sheet-lead">Vorgabe ist die Planzeit. Abweichende Uhrzeiten bitte anpassen; was nicht gegeben wurde, abwählen.</p>
      {error ? <p className="sheet-error">{error}</p> : null}
      <Group footer={`${count} von ${rows.length} werden abgehakt.`}>
        {rows.map((r, i) => (
          <Row
            key={r.it.slot}
            title={r.it.title}
            sub={`geplant ${r.it.time}`}
            accessory={
              <span className="row-acc">
                <input className="cap-input" type="time" value={r.time} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} aria-label={`Uhrzeit für ${r.it.title}`} />
                <input type="checkbox" className="ios-check" checked={r.on} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={`${r.it.title} abhaken`} />
              </span>
            }
          />
        ))}
      </Group>
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
    <Sheet title={`${regimen.name} beginnen`} onClose={onClose} onDone={save} doneDisabled={!valid} doneLabel="Beginnen">
      {regimen.note ? <p className="sheet-lead">{regimen.note}</p> : null}
      <Group footer={`Uhrzeiten: ${(regimen.slots || []).map((sl) => sl.time).join(", ") || "keine"}${to ? ` · letzter Tag ${fmtDMY(to)}` : ""}. Ändern lässt sich das unter Medikamente → Plan bearbeiten.`}>
        <Row title="Erster Tag" accessory={<input className="cap-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Erster Tag" />} />
        <Row title="Ohne festes Ende" accessory={<input type="checkbox" role="switch" className="switch" checked={open} onChange={(e) => setOpen(e.target.checked)} aria-label="Ohne festes Ende" />} />
        {!open ? <Row title="Dauer in Tagen" accessory={<input className="cap-input num" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Dauer in Tagen" />} /> : null}
        <Row title="Dosis" accessory={<input className="row-input" type="text" value={dose} placeholder="z. B. 1 Hub" onChange={(e) => setDose(e.target.value)} aria-label="Dosis" />} />
      </Group>
    </Sheet>
  );
}
