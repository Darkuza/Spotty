// Kurzanleitung für alle, die die App benutzen.

import { Sheet } from "../ui/overlays";

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Heute",
    items: [
      "Oben steht, was jetzt dran ist. Medikamente und Pflege hakt man mit dem Kreis rechts ab; die App merkt sich Uhrzeit und Person.",
      "Wird etwas deutlich später abgehakt, fragt die App, wann es wirklich gegeben wurde. Einen abgehakten Punkt antippen, um die Uhrzeit zu korrigieren oder das Häkchen zu entfernen.",
      "Mehrere offene Punkte auf einmal nachtragen: im gelben Kasten „Noch offen“ auf „Nachtragen“ tippen.",
      "Messungen (Atemzüge, SpO₂, Gewicht) über „Zählen“ oder „Eintragen“ erfassen; sie zählen dann automatisch als erledigt.",
    ],
  },
  {
    title: "Protokoll",
    items: [
      "Die Knöpfe oben legen einen Eintrag an: Trinken, Futter, Kot, Urin, Husten, Beobachtung und mehr. Mengen gibt es als Schnellwahl.",
      "Atemzüge zählen: „Atemzüge“ → „Zählen“, beim ersten Atemzug auf die große Fläche tippen und dann bei jedem weiteren; nach 30 Sekunden steht der Wert pro Minute da. Liegeseite und Untergrund mit angeben.",
      "Papierprotokoll: Foto aufnehmen, dann „Mit Claude auslesen“. Claude schlägt die Einträge vor; man hakt ab, was stimmt, und übernimmt sie.",
      "Unten stehen die Tagesbilanz, die Nacht und eine Tagesnotiz. „Tag als Text kopieren“ liefert eine Zusammenfassung zum Weiterschicken.",
      "Was andere seit deinem letzten Blick eingetragen haben, ist mit „neu“ markiert; die Zahl am Reiter zeigt, wie viele Einträge es sind.",
    ],
  },
  {
    title: "Verlauf",
    items: [
      "Diagramme für Atemzüge, Trinken, Futter, Sättigung und Gewicht; einen Tag antippen zeigt die Einzelwerte. Gestrichelte Linien markieren Therapiebeginn, Dosiswechsel und Klinikbesuche.",
      "„Bericht für die Klinik“ fasst einen Zeitraum zusammen und lässt sich teilen, etwa per Mail oder Messenger.",
    ],
  },
  {
    title: "Akte",
    items: [
      "Übersicht mit Problemliste, Kontakten, Unverträglichkeiten und Pflegehinweisen.",
      "Dokumente: Befunde als PDF oder Foto hinzufügen; Claude liest Zusammenfassung, Laborwerte und Termine aus, man prüft vor dem Übernehmen.",
      "Labor mit Referenzbereichen und Verlauf; „Alle im Vergleich“ stellt alle Untersuchungen nebeneinander. Dazu die Chronik aller Ereignisse und die Fragen an die Klinik zum Abhaken beim Telefonat.",
    ],
  },
  {
    title: "Claude",
    items: [
      "Fragen in eigenen Worten stellen; Claude kennt die Akte, den Plan und die Protokolle der letzten zwei Wochen. Mit der Kamera-Taste links lässt sich ein Foto mitschicken, etwa von Kot, Zahnfleisch oder einer Packung; Fotos werden nicht gespeichert.",
      "Jede Person sieht nur ihre eigenen Gespräche. Claude ersetzt keine Tierärztin und ändert keine Dosierungen.",
    ],
  },
  {
    title: "Notfall und Technik",
    items: [
      "Die rote Taste oben rechts zeigt Kliniknummer, Warnzeichen und eine Kurzinfo für fremde Tierärzte.",
      "Der Punkt neben der Uhr: grün heißt verbunden, gelb heißt Änderungen werden gerade gesendet, rot heißt offline. Ohne Netz kann man weiter eintragen; alles wird nachgereicht.",
      "Alle Uhrzeiten gelten für Deutschland (Berlin), auch wenn das Handy in einer anderen Zeitzone ist.",
    ],
  },
];

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Kurzanleitung" onClose={onClose}>
      {SECTIONS.map((s) => (
        <section key={s.title} className="stack-s">
          <h3 style={{ fontSize: 17 }}>{s.title}</h3>
          <ul className="help-list">
            {s.items.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
