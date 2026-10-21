// Behandlungsplan bearbeiten: Medikamente, Inhalation, Messungen mit Uhrzeiten, Dosisstufen und Vorrat.

import { useMemo, useState } from "react";
import type { Category, Measure, Pattern, Regimen, Slot, Step } from "@shared/types.ts";
import { addDays, berlinNow, fmtDMY, fmtDayShort, isValidDay, isValidHm, minutesOf, todayKey, WD_SHORT } from "@shared/dates.ts";
import { fmtAmount, stepFor, stockProjection } from "@shared/plan.ts";
import { useRegimens, saveRegimen, deleteRegimen } from "../../lib/data";
import { newId, store } from "../../lib/store";
import { Sheet, useConfirm, useSheets, useToast } from "../../ui/overlays";
import { AreaField, Chips, Field, MultiChips, Seg, TextField, Toggle } from "../../ui/controls";
import { Icon } from "../../ui/Icon";
import { Group, Row } from "../../ui/ios";
import { regimenStyle } from "../plan/planStyle";
import { CAT_LABEL } from "../../ui/kinds";

const CATS: [Category, string][] = (Object.keys(CAT_LABEL) as Category[]).map((c) => [c, CAT_LABEL[c]]);
const MEASURES: [Measure, string][] = [
  ["atem", "Atemzüge"],
  ["spo2", "SpO₂"],
  ["gewicht", "Gewicht"],
];

export function PlanSheet({ onClose }: { onClose: () => void }) {
  const regs = useRegimens();
  const sheets = useSheets();
  const today = todayKey();
  const sorted = [...regs].sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort || a.name.localeCompare(b.name, "de"));
  const open = (r: Regimen | null) => sheets.open((close) => <RegimenSheet regimen={r} onClose={close} />);
  const row = (r: Regimen) => {
    const cur = stepFor(r, today);
    const times = (r.slots || []).map((s) => s.time).join(", ");
    const st = regimenStyle(r);
    return (
      <Row
        key={r.id}
        glyph={st.glyph}
        color={r.active ? st.color : "var(--label-3)"}
        title={`${r.name}${cur?.dose ? ` ${cur.dose}` : ""}`}
        sub={`${CAT_LABEL[r.category]} · ${!r.active ? "pausiert" : cur ? `heute ${times || "ohne Uhrzeit"}` : (r.steps || []).length ? "heute nicht geplant" : "noch kein Zeitraum eingetragen"}${r.notify === false ? " · ohne Erinnerung" : ""}`}
        chevron
        onClick={() => open(r)}
      />
    );
  };
  return (
    <Sheet title="Behandlungsplan" onClose={onClose} onDone={onClose} doneLabel="Fertig">
      <p className="sheet-lead">Änderungen gelten sofort für alle. Dosen bitte nur nach Rücksprache mit der Klinik ändern.</p>
      {!regs.length ? <p className="sheet-lead">Noch kein Plan angelegt. Er kommt mit dem Import der Akte oder lässt sich hier Punkt für Punkt anlegen.</p> : null}
      {sorted.some((r) => r.active) ? <Group header="Aktiv">{sorted.filter((r) => r.active).map(row)}</Group> : null}
      {sorted.some((r) => !r.active) ? <Group header="Pausiert">{sorted.filter((r) => !r.active).map(row)}</Group> : null}
      <Group>
        <Row icon="plus" color="var(--blue)" title="Neuer Punkt" tone="blue" onClick={() => open(null)} />
      </Group>
    </Sheet>
  );
}

function emptyRegimen(): Regimen {
  return { id: `plan-${newId().slice(0, 8)}`, name: "", category: "med", purpose: null, instructions: null, unit: null, measure: null, slots: [], steps: [{ from: todayKey(), to: null, dose: null, label: null, amount: null, pattern: "daily" }], active: true, notify: true, sort: 50, stock: null, stock_at: null, note: null };
}

function uniqueSlotKey(regId: string, used: Set<string>): string {
  for (let i = 1; i < 100; i++) {
    const k = `${regId}-${i}`;
    if (!used.has(k)) return k;
  }
  return `${regId}-${newId().slice(0, 4)}`;
}

export function RegimenSheet({ regimen, onClose }: { regimen: Regimen | null; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [r, setR] = useState<Regimen>(() => (regimen ? JSON.parse(JSON.stringify(regimen)) : emptyRegimen()));
  const [stockText, setStockText] = useState(r.stock != null ? String(r.stock).replace(".", ",") : "");
  const isNew = !regimen;
  const set = (patch: Partial<Regimen>) => setR((x) => ({ ...x, ...patch }));
  const setSlot = (i: number, patch: Partial<Slot>) => set({ slots: r.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setStep = (i: number, patch: Partial<Step>) => set({ steps: r.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const allKeys = useMemo(() => {
    const ks = new Set<string>();
    for (const x of store.rows<Regimen>("regimens")) if (x.id !== r.id) for (const s of x.slots || []) ks.add(s.key);
    return ks;
  }, [r.id]);

  const problems: string[] = [];
  if (!r.name.trim()) problems.push("Name fehlt.");
  if (r.category === "mess" && !r.measure) problems.push("Bei Messungen bitte die Art wählen.");
  r.slots.forEach((s) => {
    if (!isValidHm(s.time)) problems.push(`Uhrzeit „${s.time}“ ist ungültig.`);
  });
  const keys = r.slots.map((s) => s.key);
  if (new Set(keys).size !== keys.length || keys.some((k) => allKeys.has(k))) problems.push("Zwei Uhrzeiten haben dieselbe Kennung.");
  r.steps.forEach((s, i) => {
    if (!isValidDay(s.from)) problems.push(`Zeitraum ${i + 1}: Beginn fehlt.`);
    if (s.to && s.to < s.from) problems.push(`Zeitraum ${i + 1}: Ende liegt vor dem Beginn.`);
    if (s.pattern === "weekdays" && !(s.weekdays || []).length) problems.push(`Zeitraum ${i + 1}: Wochentage wählen.`);
  });

  const stockNum = stockText.trim() ? Number(stockText.replace(",", ".")) : null;
  const projection = (() => {
    if (stockNum == null || !isFinite(stockNum)) return null;
    const now = berlinNow();
    return stockProjection({ ...r, active: true }, stockNum, now.day, now.minutes);
  })();

  const save = () => {
    if (problems.length) return;
    const stockChanged = stockNum !== (regimen?.stock ?? null);
    const out: Regimen = {
      ...r,
      name: r.name.trim(),
      purpose: r.purpose?.trim() || null,
      instructions: r.instructions?.trim() || null,
      unit: r.unit?.trim() || null,
      measure: r.category === "mess" ? r.measure : null,
      slots: [...r.slots].sort((a, b) => minutesOf(a.time) - minutesOf(b.time)).map((s) => ({ ...s, label: s.label?.trim() || null })),
      steps: [...r.steps]
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((s) => ({ ...s, to: s.to || null, dose: s.dose?.trim() || null, label: s.label?.trim() || null, amount: typeof s.amount === "number" && isFinite(s.amount) ? s.amount : null, anchor: s.pattern === "alternate" ? s.anchor || s.from : null, weekdays: s.pattern === "weekdays" ? s.weekdays || [] : null })),
      stock: stockNum != null && isFinite(stockNum) ? stockNum : null,
      stock_at: stockNum == null ? null : stockChanged ? new Date().toISOString() : r.stock_at || new Date().toISOString(),
      note: r.note?.trim() || null,
    };
    saveRegimen(out);
    toast.show(isNew ? "Planpunkt angelegt" : "Plan gespeichert");
    onClose();
  };

  const remove = async () => {
    if (!regimen) return;
    if (await confirm({ title: "Planpunkt löschen?", text: `„${regimen.name}“ verschwindet aus allen Tagen. Bereits gesetzte Häkchen bleiben gespeichert. Zum vorübergehenden Aussetzen besser „Aktiv“ ausschalten.`, confirm: "Löschen", danger: true })) {
      deleteRegimen(regimen.id);
      onClose();
    }
  };

  const addStep = () => {
    const last = r.steps[r.steps.length - 1];
    const from = last?.to ? addDays(last.to, 1) : todayKey();
    set({ steps: [...r.steps, { from, to: null, dose: last?.dose ?? null, label: null, amount: last?.amount ?? null, pattern: "daily" }] });
  };

  return (
    <Sheet
      title={isNew ? "Neuer Planpunkt" : r.name || "Planpunkt"}
      onClose={onClose}
      footer={
        <>
          {regimen ? (
            <button className="btn danger" onClick={() => void remove()}>
              Löschen
            </button>
          ) : (
            <button className="btn ghost" onClick={onClose}>
              Abbrechen
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={problems.length > 0} style={{ flex: 2 }}>
            Speichern
          </button>
        </>
      }
    >
      <TextField label="Name" value={r.name} onChange={(v) => set({ name: v })} placeholder="Name des Medikaments oder der Messung" />
      <Field label="Art">
        <Chips options={CATS} value={r.category} onChange={(v) => v && set({ category: v as Category })} allowEmpty={false} small />
      </Field>
      {r.category === "mess" ? (
        <Field label="Messung">
          <Chips options={MEASURES} value={r.measure || null} onChange={(v) => set({ measure: (v as Measure) || null })} allowEmpty={false} />
        </Field>
      ) : null}
      <TextField label="Wofür" value={r.purpose || ""} onChange={(v) => set({ purpose: v })} placeholder="z. B. Magenschutz" />
      <AreaField label="Anleitung (erscheint bei jedem Punkt)" value={r.instructions || ""} onChange={(v) => set({ instructions: v })} rows={3} />
      <div className="grid-2">
        <Toggle label="Aktiv" checked={r.active} onChange={(v) => set({ active: v })} />
        <Toggle label="Erinnerung" checked={r.notify !== false} onChange={(v) => set({ notify: v })} />
      </div>

      <div className="section-title">
        <h2>Uhrzeiten</h2>
        <button className="link-btn" onClick={() => set({ slots: [...r.slots, { key: uniqueSlotKey(r.id, new Set([...allKeys, ...keys])), time: "12:00", label: null }] })}>
          + Uhrzeit
        </button>
      </div>
      {!r.slots.length ? <p className="hint">Ohne Uhrzeit erscheint der Punkt nicht im Tagesablauf.</p> : null}
      {r.slots.map((s, i) => (
        <div key={s.key} className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
          <div className="field" style={{ width: 120, flex: "none" }}>
            <label htmlFor={`slot-${i}`}>Uhrzeit</label>
            <input id={`slot-${i}`} type="time" value={s.time} onChange={(e) => setSlot(i, { time: e.target.value })} />
          </div>
          <div className="grow">
            <TextField label="Bezeichnung (optional)" value={s.label || ""} onChange={(v) => setSlot(i, { label: v })} placeholder="z. B. morgens" />
          </div>
          <button className="icon-btn" onClick={() => set({ slots: r.slots.filter((_, j) => j !== i) })} aria-label="Uhrzeit entfernen" style={{ marginBottom: 2 }}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      ))}

      <div className="section-title">
        <h2>Zeiträume und Dosis</h2>
        <button className="link-btn" onClick={addStep}>
          + Zeitraum
        </button>
      </div>
      {!r.steps.length ? <p className="hint">Ohne Zeitraum erscheint der Punkt an keinem Tag – zum Beispiel, solange ein Medikament noch nicht da ist.</p> : null}
      {r.steps.map((s, i) => (
        <div key={i} className="card stack-s">
          <div className="row between">
            <b>
              {isValidDay(s.from) ? fmtDMY(s.from) : "?"} – {s.to && isValidDay(s.to) ? fmtDMY(s.to) : "offen"}
            </b>
            <button className="icon-btn" onClick={() => set({ steps: r.steps.filter((_, j) => j !== i) })} aria-label="Zeitraum entfernen">
              <Icon name="trash" size={18} />
            </button>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`st-from-${i}`}>von</label>
              <input id={`st-from-${i}`} type="date" value={s.from} onChange={(e) => setStep(i, { from: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`st-to-${i}`}>bis (leer = offen)</label>
              <input id={`st-to-${i}`} type="date" value={s.to || ""} onChange={(e) => setStep(i, { to: e.target.value || null })} />
            </div>
          </div>
          {r.category !== "mess" && r.category !== "foto" ? (
            <div className="grid-2">
              <TextField label="Dosis (im Titel)" value={s.dose || ""} onChange={(v) => setStep(i, { dose: v })} placeholder="z. B. 15 mg" />
              <div className="field">
                <label htmlFor={`st-amt-${i}`}>Menge je Gabe{r.unit ? ` in ${r.unit}` : ""}</label>
                <input id={`st-amt-${i}`} type="text" inputMode="decimal" value={s.amount != null ? String(s.amount).replace(".", ",") : ""} onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  setStep(i, { amount: v.trim() === "" ? null : Number(v) });
                }} placeholder="z. B. 0,75" />
              </div>
            </div>
          ) : null}
          <TextField label="Hinweis zur Dosis" value={s.label || ""} onChange={(v) => setStep(i, { label: v })} placeholder="z. B. ¾ Tablette" />
          <Seg<Pattern>
            label="Rhythmus"
            value={s.pattern || "daily"}
            onChange={(p) => setStep(i, { pattern: p })}
            options={[
              ["daily", "täglich"],
              ["alternate", "jeden 2. Tag"],
              ["weekdays", "Wochentage"],
            ]}
          />
          {s.pattern === "alternate" ? (
            <div className="field">
              <label htmlFor={`st-anchor-${i}`}>erster Tag des Rhythmus</label>
              <input id={`st-anchor-${i}`} type="date" value={s.anchor || s.from} onChange={(e) => setStep(i, { anchor: e.target.value })} />
            </div>
          ) : null}
          {s.pattern === "weekdays" ? (
            <MultiChips
              options={[1, 2, 3, 4, 5, 6, 0].map((d) => [String(d), WD_SHORT[d]] as [string, string])}
              value={(s.weekdays || []).map(String)}
              onChange={(v) => setStep(i, { weekdays: v.map(Number) })}
            />
          ) : null}
        </div>
      ))}

      {r.category === "med" || r.category === "inh" ? (
        <>
          <div className="section-title">
            <h2>Vorrat</h2>
          </div>
          <div className="grid-2">
            <TextField label="Einheit" value={r.unit || ""} onChange={(v) => set({ unit: v })} placeholder="Tabletten, Beutel, Hübe" />
            <TextField label="Vorrat jetzt" value={stockText} onChange={setStockText} inputMode="decimal" placeholder="z. B. 18" />
          </div>
          {projection ? (
            <p className={projection.runsOut ? "small" : "hint"} style={projection.runsOut ? { color: "var(--warn)", fontWeight: 600 } : undefined}>
              {projection.runsOut
                ? `Reicht bis ${projection.lastCovered ? `${fmtDayShort(projection.lastCovered.day)} ${projection.lastCovered.time}` : "jetzt"}; bis Planende fehlen ${fmtAmount(-projection.remainingAtEnd)} ${r.unit || ""}.`
                : `Reicht bis Planende${projection.end ? ` (${fmtDMY(projection.end)})` : ""}; übrig ${fmtAmount(projection.remainingAtEnd)} ${r.unit || ""}.`}
            </p>
          ) : (
            <p className="hint">Mit Vorrat und Menge je Gabe rechnet die App aus, wie lange es reicht.</p>
          )}
        </>
      ) : null}
      <AreaField label="Notiz" value={r.note || ""} onChange={(v) => set({ note: v })} rows={2} />
      {problems.length ? (
        <div className="banner warn">
          <div className="head">Noch nicht speicherbar</div>
          <p>{problems.join(" ")}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
