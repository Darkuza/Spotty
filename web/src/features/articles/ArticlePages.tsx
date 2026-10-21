// Artikel: Zeilen für die Übersicht, Liste aller Artikel und die Artikelseite.

import type { CSSProperties } from "react";
import { Glyph } from "../../ui/Glyph";
import { NavBar, Screen } from "../../ui/ios";
import { openSub } from "../../lib/route";
import { ARTICLES, articleOf, type Article } from "./articles";

export function ArticleRow({ a, onClick }: { a: Article; onClick?: () => void }) {
  return (
    <button type="button" className="arow" onClick={onClick || (() => openSub(`artikel/${a.id}`))}>
      <span className="arow-img" style={{ "--cat": a.color } as CSSProperties} aria-hidden="true">
        <Glyph name={a.glyph} size={34} />
      </span>
      <span className="arow-t">
        <span className="arow-title">{a.title}</span>
        <span className="arow-sub">{a.teaser}</span>
      </span>
    </button>
  );
}

export function ArticlesPage({ back }: { back: string }) {
  return (
    <Screen>
      <NavBar title="Artikel" large back={back} />
      <div className="arows card flat">
        {ARTICLES.map((a) => (
          <ArticleRow key={a.id} a={a} />
        ))}
      </div>
    </Screen>
  );
}

export function ArticlePage({ id, back }: { id: string; back: string }) {
  const a = articleOf(id);
  if (!a) {
    return (
      <Screen>
        <NavBar title="Artikel" back={back} />
        <p className="muted-c">Diesen Artikel gibt es nicht mehr.</p>
      </Screen>
    );
  }
  return (
    <Screen>
      <NavBar title={a.title} back={back} />
      <div className="art-hero" style={{ "--cat": a.color } as CSSProperties}>
        <Glyph name={a.glyph} size={56} />
      </div>
      <h1 className="lt art-title">{a.title}</h1>
      <p className="art-teaser">{a.teaser}</p>
      {a.sections.map((s, i) => (
        <section key={i} className="art-sec">
          {s.title ? <h2 className="art-h">{s.title}</h2> : null}
          <div className="card art-card">
            {s.text ? <p>{s.text}</p> : null}
            {s.items ? (
              s.numbered ? (
                <ol>
                  {s.items.map((t, k) => (
                    <li key={k}>{t}</li>
                  ))}
                </ol>
              ) : (
                <ul>
                  {s.items.map((t, k) => (
                    <li key={k}>{t}</li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </section>
      ))}
    </Screen>
  );
}
