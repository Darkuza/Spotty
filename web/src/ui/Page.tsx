// Seitenaufbau: großer Titel mit Zurück-Verweis und Abschnittsköpfe.

import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { goBack, previous, titleOf } from "../lib/route";

export function PageHeader({
  title,
  back,
  actions,
  eyebrow,
  sub,
  size,
}: {
  title: ReactNode;
  /** übergeordnete Seite, falls es keine vorige Seite in dieser Sitzung gibt */
  back?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  size?: "mid";
}) {
  const label = back ? titleOf(previous() || back) : "";
  return (
    <header className="ph">
      {back ? (
        <div className="ph-nav">
          <button type="button" className="back" onClick={() => goBack(back)}>
            <Icon name="left" size={20} stroke={2.2} />
            {label}
          </button>
          {actions ? <div className="ph-actions">{actions}</div> : null}
        </div>
      ) : null}
      {eyebrow ? <span className="ph-eyebrow">{eyebrow}</span> : null}
      <div className="ph-row">
        <h1 className={`ph-title${size ? ` ${size}` : ""}`}>{title}</h1>
        {!back && actions ? <div className="ph-actions">{actions}</div> : null}
      </div>
      {sub ? <div className="ph-sub">{sub}</div> : null}
    </header>
  );
}

export function Section({
  title,
  link,
  aside,
  children,
  first,
}: {
  title: ReactNode;
  link?: { label: string; onClick: () => void } | null;
  aside?: ReactNode;
  children?: ReactNode;
  first?: boolean;
}) {
  return (
    <section aria-label={typeof title === "string" ? title : undefined}>
      <div className="sec" style={first ? { paddingTop: 18 } : undefined}>
        <h2>{title}</h2>
        {link ? (
          <button type="button" className="sec-link" onClick={link.onClick}>
            {link.label}
          </button>
        ) : aside ? (
          <span className="sec-aside">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Pfeil am Ende einer Listenzeile. */
export function Chevron() {
  return (
    <span className="chev" aria-hidden="true">
      <Icon name="right" size={16} stroke={2.2} />
    </span>
  );
}
