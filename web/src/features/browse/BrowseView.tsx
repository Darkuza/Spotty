// Entdecken wie in Health: Suche, Kategorien als Kacheln, darunter die Gesundheitseinträge der Akte.

import { useMemo, useState } from "react";
import { useDocs, useProfile, useRegimens } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { openSub } from "../../lib/route";
import { useSheets } from "../../ui/overlays";
import { Avatar, CapsuleRow, CatTile, CircleButton, Group, NavBar, Row, Screen, SearchField, SectionHead } from "../../ui/ios";
import { CATS, METRICS, catColor } from "../../lib/health/metrics";
import { fmtDate } from "../../lib/health/format";
import { ARTICLES } from "../articles/articles";
import { EmergencySheet } from "../EmergencySheet";
import { ProfileHub } from "../profile/ProfileHub";
import { ReportSheet } from "../stats/ReportSheet";
import { regimenStyle } from "../plan/planStyle";
import { glyphOf, isMedRegimen, rowSub } from "../../lib/medications";
import { useMedications } from "../medications/useMedications";

/** Bereiche der Akte; Bezeichnungen mit weichem Trennstrich (\u00ad), damit lange Wörter sauber umbrechen. */
export const RECORD_AREAS: { id: string; label: string; glyph: string; words: string; route?: string }[] = [
  { id: "dokumente", label: "Klinische Dokumente", glyph: "doc", words: "befunde pdf berichte entlassung original unterlagen praxis klinik" },
  { id: "protokolle", label: "Tages\u00adprotokolle", glyph: "notes", words: "protokoll papier fotos zettel tage einträge handschrift", route: "protokolle" },
  { id: "labor", label: "Labor\u00adergebnisse", glyph: "flask", words: "blut werte blutbild" },
  { id: "diagnosen", label: "Erkrankungen", glyph: "bandage", words: "diagnosen problemliste probleme" },
  { id: "unvertraeglichkeiten", label: "Unverträg\u00adlichkeiten", glyph: "shield", words: "allergien allergie futter" },
  { id: "fragen", label: "Fragen an die Klinik", glyph: "question", words: "telefonat termin" },
  { id: "chronik", label: "Chronik", glyph: "clock", words: "verlauf ereignisse geschichte" },
  { id: "details", label: "Gesundheits\u00addetails", glyph: "person", words: "stammdaten rasse alter gewicht pflege geräte" },
  { id: "kontakte", label: "Kontakte", glyph: "phone", words: "klinik telefon nummer notdienst tierarzt" },
];

const areaRoute = (a: (typeof RECORD_AREAS)[number]) => a.route || `akte/${a.id}`;

function norm(s: string): string {
  return s
    .replace(/\u00ad/g, "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export function BrowseView() {
  const [q, setQ] = useState("");
  const sheets = useSheets();
  const profile = useProfile();
  const name = profile?.data?.name || "Spotty";
  return (
    <Screen>
      <NavBar
        title="Entdecken"
        large
        trailing={
          <>
            <CircleButton glyph="phone" tone="red" label="Notfall" onClick={() => sheets.open((close) => <EmergencySheet onClose={close} />)} />
            <Avatar name={name} onClick={() => sheets.open((close) => <ProfileHub onClose={close} />)} />
          </>
        }
        largeExtra={<SearchField value={q} onChange={setQ} />}
      />
      {q.trim() ? <SearchResults q={q} /> : <Categories />}
    </Screen>
  );
}

function Categories() {
  const sheets = useSheets();
  const now = useNowValue();
  return (
    <>
      <SectionHead title="Gesundheitskategorien" />
      <div className="ctiles">
        {CATS.map((c) => (
          <CatTile key={c.id} glyph={c.glyph} color={catColor(c.id)} label={c.label} onClick={() => openSub(c.id === "medikamente" ? "medikamente" : `k/${c.id}`)} />
        ))}
      </div>
      <CapsuleRow glyph="people" color="var(--blue)" label="Familie und Einträge" onClick={() => openSub("familie")} />
      <SectionHead title="Gesundheitseinträge" />
      <div className="ctiles">
        {RECORD_AREAS.map((a) => (
          <CatTile key={a.id} glyph={a.glyph} color="var(--blue)" label={a.label} onClick={() => openSub(areaRoute(a))} />
        ))}
      </div>
      <CapsuleRow glyph="doc" color="var(--blue)" label="Bericht für die Klinik" onClick={() => sheets.open((close) => <ReportSheet now={now} onClose={close} />)} />
    </>
  );
}

/** Seiten und Blätter der App, die die Suche ebenfalls findet. */
const PAGES: { id: string; label: string; glyph: string; color: string; words: string; sub?: string }[] = [
  { id: "notfall", label: "Notfall", glyph: "phone", color: "var(--red)", words: "notfall klinik anrufen warnzeichen notdienst notfallpass kurzinfo" },
  { id: "protokoll", label: "Tagesprotokoll von heute", glyph: "notes", color: "var(--blue)", words: "protokoll einträge papier foto zettel notiz tag heute" },
  { id: "tabelle", label: "Tage im Überblick", glyph: "calendar", color: "var(--blue)", words: "tabelle verlauf csv export überblick kopieren" },
  { id: "alle-daten", label: "Alle Daten", glyph: "heart", color: "var(--red)", words: "alle daten messwerte" },
  { id: "trends", label: "Trends", glyph: "trend", color: "var(--blue)", words: "trend entwicklung vergleich" },
  { id: "highlights", label: "Highlights", glyph: "sparkle", color: "var(--blue)", words: "highlights zusammenfassung woche" },
  { id: "familie", label: "Familie und Einträge", glyph: "people", color: "var(--c-befinden)", words: "familie mitglieder wer eingetragen" },
  { id: "bericht", label: "Bericht für die Klinik", glyph: "doc", color: "var(--blue)", words: "bericht klinik teilen senden" },
];

function SearchResults({ q }: { q: string }) {
  const regimens = useRegimens();
  const meds = useMedications();
  const docs = useDocs();
  const sheets = useSheets();
  const now = useNowValue();
  const n = norm(q.trim());
  const hit = (...xs: (string | null | undefined)[]) => xs.some((x) => x && norm(x).includes(n));
  const pages = PAGES.filter((p) => hit(p.label, p.words));
  const openPage = (id: string) => {
    if (id === "notfall") sheets.open((close) => <EmergencySheet onClose={close} />);
    else if (id === "bericht") sheets.open((close) => <ReportSheet now={now} onClose={close} />);
    else openSub(id);
  };
  const metrics = useMemo(() => METRICS.filter((m) => hit(m.label, m.tag, CATS.find((c) => c.id === m.cat)?.label)), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = CATS.filter((c) => hit(c.label));
  const regs = regimens.filter((r) => !isMedRegimen(r) && hit(r.name, r.purpose, r.instructions));
  const medHits = meds.filter((it) => hit(it.name, it.substance?.name, it.substance?.group, it.substance?.line, ...(it.substance?.aliases || []), ...(it.substance?.similar || []), ...(it.substance?.brands || []), ...it.regimens.flatMap((r) => [r.name, r.purpose, r.instructions])));
  const ds = docs.filter((d) => hit(d.title, d.issuer, d.summary)).slice(0, 12);
  const areas = RECORD_AREAS.filter((a) => hit(a.label, a.words));
  const arts = ARTICLES.filter((a) => hit(a.title, a.teaser));
  const none = !pages.length && !metrics.length && !cats.length && !regs.length && !medHits.length && !ds.length && !areas.length && !arts.length;
  if (none) return <p className="search-none">Keine Treffer für „{q.trim()}“.</p>;
  return (
    <>
      {pages.length ? (
        <Group header="Seiten">
          {pages.map((p) => (
            <Row key={p.id} glyph={p.glyph} color={p.color} title={p.label} chevron onClick={() => openPage(p.id)} />
          ))}
        </Group>
      ) : null}
      {cats.length || metrics.length ? (
        <Group header="Messwerte und Kategorien">
          {cats.map((c) => (
            <Row key={c.id} glyph={c.glyph} color={catColor(c.id)} title={c.label} chevron onClick={() => openSub(c.id === "medikamente" ? "medikamente" : `k/${c.id}`)} />
          ))}
          {metrics.map((m) => (
            <Row key={m.id} glyph={m.glyph} color={catColor(m.cat)} title={m.label} sub={CATS.find((c) => c.id === m.cat)?.label} chevron onClick={() => openSub(m.id === "plan" ? "tagesplan" : `m/${m.id}`)} />
          ))}
        </Group>
      ) : null}
      {regs.length || medHits.length ? (
        <Group header="Medikamente und Plan">
          {medHits.map((it) => (
            <Row key={it.key} glyph={glyphOf(it)} color={it.status === "aktuell" || it.status === "geplant" ? "var(--c-medikamente)" : "var(--label-3)"} title={it.name} sub={rowSub(it, now.day)} wrap chevron onClick={() => openSub(`medikamente/${it.key}`)} />
          ))}
          {regs.map((r) => {
            const st = regimenStyle(r);
            return <Row key={r.id} glyph={st.glyph} color={st.color} title={r.name} sub={r.purpose || undefined} chevron onClick={() => openSub(`medikamente/${r.id}`)} />;
          })}
        </Group>
      ) : null}
      {areas.length ? (
        <Group header="Akte">
          {areas.map((a) => (
            <Row key={a.id} glyph={a.glyph} color="var(--blue)" title={a.label} chevron onClick={() => openSub(areaRoute(a))} />
          ))}
        </Group>
      ) : null}
      {ds.length ? (
        <Group header="Dokumente">
          {ds.map((d) => (
            <Row key={d.id} glyph="doc" color="var(--blue)" title={d.title} sub={[d.doc_date ? fmtDate(d.doc_date) : "", d.issuer].filter(Boolean).join(" · ")} chevron onClick={() => openSub(`akte/dokument/${d.id}`)} />
          ))}
        </Group>
      ) : null}
      {arts.length ? (
        <Group header="Artikel">
          {arts.map((a) => (
            <Row key={a.id} glyph={a.glyph} color={a.color} title={a.title} sub={a.teaser} chevron onClick={() => openSub(`artikel/${a.id}`)} />
          ))}
        </Group>
      ) : null}
    </>
  );
}
