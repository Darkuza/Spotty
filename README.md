# Spotty

Pflege-App für die Familie eines schwer kranken Hundes: Tagesplan zum Abhaken, Protokoll mit Atemzähler und Fotos der Papierprotokolle, Verlauf mit Diagrammen, die vollständige Akte mit Befunden, Laborwerten und Chronik, und ein eingebauter Claude-Assistent, der diese Akte kennt.

Das Repository enthält nur Code. Befunde, Protokolle und Namen liegen ausschließlich in der eigenen Supabase-Datenbank und werden einmalig über eine Akte-Datei in der App importiert.

## Funktionen

| Bereich | Inhalt |
|---|---|
| Heute | Was jetzt dran ist, Tagesablauf mit Häkchen (mit Uhrzeit und Name), Messungen im Plan, Medikamentenstand mit nächster Dosisänderung und Vorratsrechnung |
| Protokoll | Schnelleinträge für Atemzüge (Tipp-Zähler 30/60 s), SpO₂, Trinken, Futter, Kot, Urin, Gassi, Husten, Erbrechen, Gewicht, Medikamente, Beobachtungen; Warnhinweise mit Kliniknummer; Fotos der Papierprotokolle, die Claude zeilenweise ausliest |
| Verlauf | Kennzahlen, Atemzüge mit Ausgangswert und Zielwert, SpO₂, Gewicht, Trinken und Futter je Tag, Tagestabelle, Export als Text und CSV, Auswertung durch Claude |
| Akte | Übersicht (Stammdaten, Problemliste, Kontakte, Unverträglichkeiten, Pflegehinweise, Leitlinie), Dokumente mit Originalen, Laborwerte mit Referenzbalken und Verlauf, Chronik, Fragen an die Klinik |
| Claude | Fragen mit der ganzen Akte, dem Plan und den Protokollen der letzten zwei Wochen als Wissensstand; Gespräche je Person |
| Notfall | Kliniknummer, Warnzeichen, was bis zur Hilfe zu tun ist, Kurzinfo für fremde Tierärzte |

Dazu: Anmeldung nur für eingetragene Mitglieder, Echtzeit-Abgleich zwischen allen Geräten, Offline-Betrieb mit Nachsenden, Push-Erinnerungen zur Planzeit, Installation als App auf dem Home-Bildschirm, helles und dunkles Farbschema.

## Aufbau

```
web/                  React-App (Vite, TypeScript, PWA)
supabase/migrations/  Datenbank: Tabellen, Zugriffsregeln, Dateiablage, Zeitplan
supabase/functions/   Edge Functions: Claude-Assistent, Auslesen, Push, Mitglieder
supabase/functions/_shared/  gemeinsame Logik für App und Server (Plan, Bilanzen, Warnregeln)
tools/                Hilfsskripte (Akte-Datei bauen, Schlüssel erzeugen, Symbole)
.github/workflows/    Prüfen und Bereitstellen
docs/                 Einrichtung, Architektur, Datenimport
```

## Einrichtung

Schritt für Schritt in [docs/SETUP.md](docs/SETUP.md). Kurzfassung: Supabase-Projekt (Frankfurt) und Claude-API-Schlüssel anlegen, sechs Secrets im Repository eintragen, GitHub Pages auf „GitHub Actions“ stellen. Jeder Push auf `main` prüft den Code und stellt Datenbank, Functions und App bereit.

## Entwicklung

```bash
cd web
npm ci
npm run dev        # Demo-Modus ohne Server (Daten nur im Browser)
npm run typecheck
npm test
```

Weitere Details: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), [docs/DATENIMPORT.md](docs/DATENIMPORT.md).

## Hinweis

Die App unterstützt die Pflege und ersetzt keine tierärztliche Beratung. Dosierungen ändert nur die behandelnde Klinik.
