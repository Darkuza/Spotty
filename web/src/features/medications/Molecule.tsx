// Strukturformel (SVG aus tools/make-structures.py) mit Summenformel, Molmasse und Legende der markierten Teile.

import type { Legend, MoleculeRef } from "./catalog";
import { STRUCTURES } from "./structures.generated";
import { fmt } from "../../lib/health/format";

/** Summenformel mit tiefgestellten Ziffern: C17H19N3O3S */
export function Formula({ text }: { text: string }) {
  return <>{text.split(/(\d+)/).map((part, i) => (i % 2 ? <sub key={i}>{part}</sub> : part))}</>;
}

/** Bildschirmpixel je Zeichenpixel: gleiche Bindungslänge für alle Moleküle, lange Zeichnungen passen sich der Breite an. */
const SCALE = 0.62;

export function Molecule({ id, label }: { id: string; label: string }) {
  const m = STRUCTURES[id];
  if (!m) return null;
  const vb = /viewBox='[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+'/.exec(m.svg);
  const width = vb ? Math.round(Number(vb[1]) * SCALE) : undefined;
  // Die Zeichnung stammt aus dem eigenen Quelltext (tools/make-structures.py), nicht aus Eingaben.
  return <div className="mol-wrap" style={width ? { maxWidth: width } : undefined} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: m.svg }} />;
}

export function LegendList({ items }: { items: Legend[] }) {
  return (
    <ul className="mleg">
      {items.map((l, i) => (
        <li key={i}>
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <circle className={`mdot ${l.k}`} cx="7" cy="7" r="7" />
          </svg>
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Zeichnung, Formel und Molmasse, Legende und Anmerkung zu einem Molekül. */
export function MoleculeBlock({ mref, name, kicker }: { mref: MoleculeRef; name: string; kicker?: string }) {
  const m = STRUCTURES[mref.id];
  if (!m) return null;
  const title = mref.title || name;
  return (
    <>
      {kicker || mref.title ? <p className="mmol-name">{[kicker, mref.title].filter(Boolean).join(" · ")}</p> : null}
      <Molecule id={mref.id} label={`Strukturformel ${title}`} />
      <p className="mmol-meta">
        <Formula text={m.formula} /> · {fmt(m.mass, 1)} g/mol
      </p>
      {mref.legend && mref.legend.length ? <LegendList items={mref.legend} /> : null}
      {mref.note ? <p className="mmol-note">{mref.note}</p> : null}
    </>
  );
}
