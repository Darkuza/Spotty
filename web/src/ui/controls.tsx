// Eingabebausteine: Auswahlchips, Segmente, Zahlenfeld, Schalter.

import { useId, type ReactNode } from "react";
import type { Opt } from "@shared/entryTypes.ts";

function optVal(o: Opt): string {
  return Array.isArray(o) ? o[0] : o;
}
function optText(o: Opt): string {
  return Array.isArray(o) ? o[1] : o;
}

export function Chips({ options, value, onChange, small, allowEmpty = true }: { options: Opt[]; value: string | null | undefined; onChange: (v: string | null) => void; small?: boolean; allowEmpty?: boolean }) {
  return (
    <div className="chips" role="group">
      {options.map((o) => {
        const v = optVal(o);
        const on = value === v;
        return (
          <button key={v} type="button" className={`chip${small ? " small" : ""}`} aria-pressed={on} onClick={() => onChange(on && allowEmpty ? null : v)}>
            {optText(o)}
          </button>
        );
      })}
    </div>
  );
}

export function MultiChips({ options, value, onChange }: { options: Opt[]; value: string[] | null | undefined; onChange: (v: string[]) => void }) {
  const cur = value || [];
  return (
    <div className="chips" role="group">
      {options.map((o) => {
        const v = optVal(o);
        const on = cur.includes(v);
        return (
          <button key={v} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? cur.filter((x) => x !== v) : [...cur, v])}>
            {optText(o)}
          </button>
        );
      })}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextField({ label, value, onChange, type = "text", placeholder, hint, autoComplete, inputMode }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: ReactNode; autoComplete?: string; inputMode?: "text" | "decimal" | "numeric" | "email" }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function AreaField({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="toggle">
      <label htmlFor={id} className="grow">
        <span style={{ display: "block", fontWeight: 600 }}>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </label>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function NumberInput({ id, value, onChange, unit, dec, placeholder }: { id?: string; value: string; onChange: (v: string) => void; unit?: string; dec?: number; placeholder?: string }) {
  return (
    <div className="num-input">
      <input
        id={id}
        type="text"
        inputMode={dec ? "decimal" : "numeric"}
        value={value}
        placeholder={placeholder || "–"}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
        aria-label={unit ? `Wert in ${unit}` : "Wert"}
      />
      {unit ? <span className="unit">{unit}</span> : null}
    </div>
  );
}
