// Bausteine im Aufbau der Health-App: Navigationsleiste mit runden Tasten, großer Titel,
// Abschnittsköpfe, gruppierte Listen, Karten, Kacheln und der Zeitraumschalter.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Glyph } from "./Glyph";
import { goBack } from "../lib/route";
import { addDays } from "@shared/dates.ts";

/** Wurde die Seite gescrollt? Steuert den Hintergrund der Navigationsleiste und den kleinen Titel. */
export function useScrolled(threshold = 6): boolean {
  const [s, setS] = useState(() => typeof window !== "undefined" && window.scrollY > threshold);
  useEffect(() => {
    const on = () => setS(window.scrollY > threshold);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [threshold]);
  return s;
}

export function CircleButton({
  icon,
  glyph,
  label,
  onClick,
  tone,
  disabled,
  pressed,
}: {
  icon?: string;
  glyph?: string;
  label: string;
  onClick?: () => void;
  tone?: "blue" | "red" | "plain";
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button type="button" className={`cb${tone ? ` ${tone}` : ""}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}>
      {glyph ? <Glyph name={glyph} size={21} /> : <Icon name={icon || "dot"} size={20} stroke={2.3} />}
    </button>
  );
}

/** Kreis mit Initialen wie das Profilbild in Health. */
export function Avatar({ name, onClick }: { name: string; onClick: () => void }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SP";
  const two = initials.length === 1 ? name.slice(0, 2).toUpperCase() : initials;
  return (
    <button type="button" className="avatar" onClick={onClick} aria-label={`Profil von ${name}`}>
      <span>{two}</span>
    </button>
  );
}

/**
 * Navigationsleiste. Bei `large` steht der Titel groß unter der Leiste und erscheint klein in der Mitte,
 * sobald gescrollt wird; sonst steht er immer klein in der Mitte.
 */
export function NavBar({
  title,
  large,
  back,
  onClose,
  leading,
  trailing,
  largeExtra,
}: {
  title?: string;
  large?: boolean;
  back?: string;
  onClose?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** unter dem großen Titel, z. B. die Suche */
  largeExtra?: ReactNode;
}) {
  const scrolled = useScrolled(large ? 46 : 4);
  return (
    <>
      <header className={`nav${scrolled ? " scrolled" : ""}`}>
        <div className="nav-row">
          <div className="nav-lead">
            {back ? <CircleButton icon="left" label="Zurück" onClick={() => goBack(back)} /> : null}
            {onClose ? <CircleButton icon="close" label="Schließen" onClick={onClose} /> : null}
            {leading}
          </div>
          {title ? (
            <div className={`nav-title${large && !scrolled ? " away" : ""}`} aria-hidden={large ? true : undefined}>
              {title}
            </div>
          ) : null}
          <div className="nav-trail">{trailing}</div>
        </div>
      </header>
      {large && title ? <h1 className="lt">{title}</h1> : null}
      {largeExtra}
    </>
  );
}

/** Seite mit optional farbigem Kopf (Kategorieseiten). */
export function Screen({ tint, children, className }: { tint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`scr${tint ? " tinted" : ""}${className ? ` ${className}` : ""}`} style={tint ? ({ "--tint": tint } as CSSProperties) : undefined}>
      {tint ? <div className="tint-bg" aria-hidden="true" /> : null}
      {children}
    </div>
  );
}

/** Abschnittskopf wie „Angepinnt“ mit „Bearbeiten“. */
export function SectionHead({ title, action, sub }: { title: string; action?: { label: string; onClick: () => void } | null; sub?: ReactNode }) {
  return (
    <div className="sh">
      <h2>{title}</h2>
      {action ? (
        <button type="button" className="sh-link" onClick={action.onClick}>
          {action.label}
        </button>
      ) : sub ? (
        <span className="sh-sub">{sub}</span>
      ) : null}
    </div>
  );
}

/** Gruppierte Liste mit kleiner Überschrift und Fußnote. */
export function Group({ header, footer, children, className, cap }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; cap?: boolean }) {
  return (
    <section className={`grp${cap ? " cap" : ""}${className ? ` ${className}` : ""}`}>
      {header ? <h3 className="grp-h">{header}</h3> : null}
      <div className="grp-c">{children}</div>
      {footer ? <p className="grp-f">{footer}</p> : null}
    </section>
  );
}

export function Row({
  glyph,
  icon,
  color,
  title,
  sub,
  value,
  chevron,
  onClick,
  href,
  tone,
  accessory,
  wrap,
  ariaLabel,
}: {
  glyph?: string;
  icon?: string;
  color?: string;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  href?: string;
  tone?: "blue" | "red";
  accessory?: ReactNode;
  wrap?: boolean;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      {glyph ? (
        <span className="row-ic" style={color ? { color } : undefined} aria-hidden="true">
          <Glyph name={glyph} size={24} />
        </span>
      ) : icon ? (
        <span className="row-ic" style={color ? { color } : undefined} aria-hidden="true">
          <Icon name={icon} size={22} stroke={2} />
        </span>
      ) : null}
      <span className={`row-t${wrap ? " multi" : ""}`}>
        <span className={`row-title${tone ? ` ${tone}` : ""}`}>{title}</span>
        {sub ? <span className="row-sub">{sub}</span> : null}
      </span>
      {value !== undefined && value !== null ? <span className="row-v">{value}</span> : null}
      {accessory}
      {chevron ? (
        <span className="row-chev" aria-hidden="true">
          <Icon name="right" size={15} stroke={2.6} />
        </span>
      ) : null}
    </>
  );
  if (onClick)
    return (
      <button type="button" className="lrow" onClick={onClick} aria-label={ariaLabel}>
        {inner}
      </button>
    );
  if (href)
    return (
      <a className="lrow" href={href} aria-label={ariaLabel}>
        {inner}
      </a>
    );
  return <div className="lrow">{inner}</div>;
}

/** Einzelne Zeile als Kapsel, z. B. „Alle Daten anzeigen“. */
export function CapsuleRow({ glyph, color, label, onClick, value }: { glyph?: string; color?: string; label: string; onClick: () => void; value?: ReactNode }) {
  return (
    <Group cap>
      <Row glyph={glyph} color={color || "var(--blue)"} title={label} value={value} chevron onClick={onClick} />
    </Group>
  );
}

/** Zeitraumschalter T · W · M · 6 M. · J und andere Segmente. */
export function Segmented<T extends string>({ options, value, onChange, label, small }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string; small?: boolean }) {
  const i = Math.max(0, options.findIndex((o) => o[0] === value));
  return (
    <div className={`segc${small ? " small" : ""}`} role="tablist" aria-label={label} style={{ "--n": options.length, "--i": i } as CSSProperties}>
      <span className="segc-thumb" aria-hidden="true" />
      {options.map(([v, t]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = "Suchen", onFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; onFocus?: () => void }) {
  return (
    <label className="searchf">
      <Icon name="search" size={19} stroke={2.4} />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} enterKeyHint="search" aria-label={placeholder} />
      {value ? (
        <button type="button" className="searchf-x" onClick={() => onChange("")} aria-label="Suche leeren">
          <Icon name="close" size={13} stroke={3} />
        </button>
      ) : null}
    </label>
  );
}

/** Karte oben in der Übersicht: Kopfzeile, Trennlinie, Symbol, Titel, Text und Tasten. */
export function PromptCard({
  label,
  labelColor,
  glyph,
  color,
  title,
  text,
  children,
  onDismiss,
  role,
}: {
  label: string;
  labelColor?: string;
  glyph: string;
  color: string;
  title: ReactNode;
  text?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  role?: "alert";
}) {
  return (
    <section className="pc" role={role} aria-label={label}>
      <div className="pc-head">
        <span className="pc-label" style={labelColor ? { color: labelColor } : undefined}>
          {label}
        </span>
        {onDismiss ? (
          <button type="button" className="xb" onClick={onDismiss} aria-label="Ausblenden">
            <Icon name="close" size={12} stroke={3} />
          </button>
        ) : null}
      </div>
      <div className="pc-body">
        <span className="pc-ic" style={{ color }} aria-hidden="true">
          <Glyph name={glyph} size={34} />
        </span>
        <div className="pc-main">
          <p className="pc-title">{title}</p>
          {text ? <div className="pc-text">{text}</div> : null}
          {children ? <div className="pc-actions">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

/** Karte „Nutze Spotty bestmöglich“: großes Symbol, Titel, Text, gefüllte Taste, Schließen-Kreuz. */
export function TipCard({ glyph, color, title, text, action, onDismiss }: { glyph: string; color: string; title: string; text: string; action?: { label: string; onClick: () => void }; onDismiss?: () => void }) {
  return (
    <section className="tipc" aria-label={title}>
      <span className="tipc-ic" style={{ color }} aria-hidden="true">
        <Glyph name={glyph} size={52} />
      </span>
      <div className="tipc-main">
        <p className="tipc-title">{title}</p>
        <p className="tipc-text">{text}</p>
        {action ? (
          <button type="button" className="pill fill" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button type="button" className="xb tipc-x" onClick={onDismiss} aria-label="Ausblenden">
          <Icon name="close" size={12} stroke={3} />
        </button>
      ) : null}
    </section>
  );
}

/** Kachel im Raster „Entdecken“. */
export function CatTile({ glyph, color, label, onClick }: { glyph: string; color: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className="ctile" onClick={onClick}>
      <span className="ctile-ic" style={{ color }} aria-hidden="true">
        <Glyph name={glyph} size={34} />
      </span>
      <span className="ctile-l">{label}</span>
    </button>
  );
}

/** Kapselförmige Taste: getönt (Standard), gefüllt oder schlicht. */
export function Pill({ children, onClick, kind = "tint", tone, disabled, ariaLabel, href }: { children: ReactNode; onClick?: () => void; kind?: "tint" | "fill" | "plain" | "gray"; tone?: "red" | "green"; disabled?: boolean; ariaLabel?: string; href?: string }) {
  const cls = `pill ${kind}${tone ? ` ${tone}` : ""}`;
  if (href)
    return (
      <a className={cls} href={href} aria-label={ariaLabel}>
        {children}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

/** Schalter wie in den Einstellungen von iOS. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />;
}

/** Leerer Zustand in einer Karte. */
export function EmptyCard({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty2">
      <p className="empty2-t">{title}</p>
      {children ? <div className="empty2-x">{children}</div> : null}
    </div>
  );
}

/** Tag wechseln: ‹ Heute ›, ein Tipp auf den Namen springt zu heute. */
export function DayStepper({ day, today, onChange, label }: { day: string; today: string; onChange: (d: string) => void; label: string }) {
  return (
    <div className="daystep" role="group" aria-label="Tag wählen">
      <button type="button" onClick={() => onChange(addDays(day, -1))} aria-label="Vorheriger Tag">
        <Icon name="left" size={17} stroke={2.6} />
      </button>
      <button type="button" className="daystep-l" onClick={() => onChange(today)} aria-label={day === today ? label : `${label}, zu heute springen`}>
        {label}
      </button>
      <button type="button" onClick={() => onChange(addDays(day, 1))} aria-label="Nächster Tag">
        <Icon name="right" size={17} stroke={2.6} />
      </button>
    </div>
  );
}
