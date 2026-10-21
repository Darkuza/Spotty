// Kurze Artikel für „Artikel“ in der Übersicht: Atemzüge zählen, Warnzeichen, Sättigung messen, Bedienung.
// Die Inhalte stammen aus den Hinweisen der Eingabemasken und dem Notfallblatt.

export interface ArticleSection {
  title?: string;
  text?: string;
  items?: string[];
  numbered?: boolean;
}

export interface Article {
  id: string;
  title: string;
  teaser: string;
  glyph: string;
  color: string;
  sections: ArticleSection[];
}

export const SIGNS = [
  "Atemzüge in Ruhe oder im Schlaf anhaltend über 40 pro Minute oder rasch steigend, Atmen mit offenem Maul, angestrengte Bauchatmung",
  "Zunge oder Zahnfleisch blass, grau oder bläulich",
  "SpO₂ unter 90 % trotz Sauerstoff, oder unter 95 %, das sich mit Sauerstoff nicht bessert",
  "Zusammenbruch, Ohnmacht, plötzliche starke Schwäche",
  "Schwarzer, klebriger Kot oder Erbrechen mit Blut oder kaffeesatzartigem Inhalt",
  "Wiederholtes Erbrechen, starke Schmerzen, aufgekrümmter Rücken, harter Bauch",
  "Husten mit Blut",
  "Frisst und trinkt seit mehr als 24 Stunden nichts",
];

export const MEANWHILE = [
  "Ruhig bleiben und ruhig sprechen; Aufregung erhöht den Sauerstoffbedarf.",
  "Sauerstoff vor die Nase halten (Flow-by), Kopf leicht erhöht, kühl lagern.",
  "Nichts füttern und nicht mit der Spritze trinken lassen, solange er schwer atmet.",
  "Zum Transport liegend tragen, nicht laufen lassen.",
  "Die Kurzinfo im Notfallblatt kopieren oder vorzeigen; Medikamentenschachteln mitnehmen.",
];

export const ARTICLES: Article[] = [
  {
    id: "atemzuege",
    title: "Atemzüge richtig zählen",
    teaser: "Im Schlaf oder in Ruhe zählen, die Liegeseite angeben und nie beim Hecheln.",
    glyph: "lungs",
    color: "var(--c-atmung)",
    sections: [
      {
        text: "Die Atemzüge in Ruhe sind der wichtigste Wert für Spottys Lunge und Herz. Gezählt wird am besten, wenn er schläft oder ruhig liegt.",
      },
      {
        title: "So geht es",
        numbered: true,
        items: [
          "Unter „Schnell eintragen“ auf „Atemzüge“ tippen. Der Zähler öffnet sich.",
          "Beim ersten Atemzug auf den Kreis tippen, dann bei jedem weiteren. Ein Atemzug ist einmal Heben und Senken des Brustkorbs.",
          "Nach 30 Sekunden rechnet die App auf eine Minute hoch. Für unruhige Phasen lassen sich auch 60 Sekunden wählen.",
          "Liegeseite, Untergrund und ob er schläft angeben, dann speichern.",
        ],
      },
      {
        title: "Worauf achten",
        items: [
          "Nicht beim Hecheln zählen; Cortison kann Hecheln auslösen.",
          "Die Liegeseite hilft beim Vergleich, weil eine kranke Lungenseite oben oder unten liegen kann.",
          "Bei Hunden mit Herzklappenerkrankung gilt eine Schlafatemfrequenz über 40 pro Minute als Warnzeichen; gesunde Hunde liegen meist unter 30. Entscheidend ist die Richtung unter der Behandlung.",
        ],
      },
    ],
  },
  {
    id: "warnzeichen",
    title: "Wann sofort die Klinik anrufen",
    teaser: "Die Warnzeichen und was bis zur Hilfe zu tun ist.",
    glyph: "alert",
    color: "var(--red)",
    sections: [
      { title: "Sofort anrufen bei", items: SIGNS },
      { title: "Bis Hilfe da ist", items: MEANWHILE, numbered: true },
      { text: "Die rote Taste oben in der Übersicht öffnet das Notfallblatt mit der Nummer der Klinik und einer Kurzinfo für fremde Tierärzte." },
    ],
  },
  {
    id: "saettigung",
    title: "Sättigung messen",
    teaser: "Erst nach Ruhe messen und den Wert nehmen, der stabil steht.",
    glyph: "o2",
    color: "var(--c-atmung)",
    sections: [
      {
        numbered: true,
        items: [
          "Erst nach 15–20 Minuten Ruhe messen.",
          "Den Wert nehmen, der 20–30 Sekunden stabil steht.",
          "Prüfen, ob der Puls des Geräts zum Herzschlag passt: Hand links an den Brustkorb legen, 15 Sekunden zählen und mal 4 nehmen. Passt er nicht, Sensor neu anlegen und wiederholen.",
        ],
      },
      {
        title: "Einordnen",
        items: [
          "95 % und mehr ist in Ordnung.",
          "Unter 95 %: Sauerstoff (Flow-by) vor die Nase halten und in 10 Minuten an derselben Stelle wiederholen. Bleibt der Wert darunter, die Klinik anrufen.",
          "Unter 90 %: Sauerstoff vor die Nase halten und sofort die Klinik anrufen.",
        ],
      },
    ],
  },
  {
    id: "spotty",
    title: "So funktioniert Spotty",
    teaser: "Was wo steht und wie man einträgt.",
    glyph: "book",
    color: "var(--blue)",
    sections: [
      {
        title: "Übersicht",
        items: [
          "Oben steht, was gerade fällig ist. „Gegeben“ hakt ab, „Ausgelassen“ vermerkt, dass es bewusst nicht gegeben wurde; beides merkt sich Uhrzeit und Person. Bei mehreren Punkten zur selben Uhrzeit öffnet „Protokollieren“ die Liste.",
          "Wird deutlich später abgehakt, fragt die App nach der tatsächlichen Uhrzeit. Liegen zwei Gaben näher beieinander, als der Plan erlaubt (etwa „2 h Abstand zu …“), steht die früheste Uhrzeit dabei.",
          "„Schnell eintragen“ legt Einträge an, etwa Atemzüge, Trinken oder Kot. Mit „Bearbeiten“ lässt sich wählen, welche Knöpfe erscheinen.",
          "„Angepinnt“ zeigt die wichtigsten Werte mit kleinem Verlauf; ein Antippen öffnet den Messwert mit Diagramm. „Bearbeiten“ legt fest, was angepinnt ist.",
          "Highlights vergleichen den Tag mit sonst und fassen die letzte Woche zusammen.",
        ],
      },
      {
        title: "Entdecken",
        items: [
          "Alle Messwerte nach Kategorien, darunter die Akte: Dokumente, Laborergebnisse, Diagnosen, Unverträglichkeiten, Fragen an die Klinik und die Chronik.",
          "„Medikamente“ zeigt den Tagesplan mit allen Uhrzeiten, die Mittel mit Stufenplan und Vorrat und die Abstandsregeln.",
          "Jeder Messwert hat ein Diagramm für Tag, Woche, Monat, sechs Monate und Jahr. Einen Balken antippen zeigt den Wert; zur Seite wischen blättert zurück.",
        ],
      },
      {
        title: "Tagesprotokoll",
        items: [
          "Alle Einträge eines Tages mit Uhrzeit und Person, die Fotos vom Papierprotokoll und die Notizen zum Tag.",
          "Papierprotokoll: Foto aufnehmen, dann „Mit Claude auslesen“. Claude schlägt Einträge vor; übernommen wird erst nach dem Prüfen.",
        ],
      },
      {
        title: "Claude, Profil und Notfall",
        items: [
          "Die runde Taste neben der Leiste unten öffnet Claude. Claude kennt Akte, Plan und Protokolle der letzten zwei Wochen und ersetzt keine Tierärztin.",
          "Das Profilbild oben rechts öffnet Spottys Profil: Gesundheitsdetails, Notfallpass, Familie, Erinnerungen, Plan, Bericht für die Klinik und die Darstellung.",
          "Die rote Taste daneben zeigt die Nummer der Klinik, die Warnzeichen und eine Kurzinfo für fremde Tierärzte.",
          "Ohne Netz kann man weiter eintragen; alles wird nachgereicht. Alle Uhrzeiten gelten für Deutschland.",
        ],
      },
    ],
  },
];

export function articleOf(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id);
}
