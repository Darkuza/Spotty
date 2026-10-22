# Architektur

## Überblick

```
iPhone / Browser (PWA, React)
   │  Anmeldung, Tabellen, Echtzeit, Dateien          ┌──────────────────────────────┐
   ├──────────────────────────────────────────────────►│ Supabase (Frankfurt)         │
   │                                                   │  Postgres + Zugriffsregeln   │
   │  Claude-Fragen, Auslesen, Push-Abo, Mitglieder    │  Auth (E-Mail + Passwort)    │
   └──────────────────────────────────────────────────►│  Storage: photos, documents  │
                                                       │  Edge Functions (Deno) ──────┼──► Claude API
                                                       │  pg_cron alle 5 min ─► push-tick ─► Web Push
                                                       └──────────────────────────────┘
```

Die App wird als statische Seite über GitHub Pages ausgeliefert. Alles, was Daten enthält, liegt in Supabase. Der Claude-Schlüssel und die Push-Schlüssel kennt nur der Server.

## Web-App (`web/`)

- React 19, TypeScript, Vite, eigener Service Worker (Workbox) für Offline-Betrieb und Push.
- Schriften IBM Plex Sans, Sans Condensed und Mono werden mit der App ausgeliefert (keine Anfragen an Google).
- **Datenspeicher** (`src/lib/store.ts`): lädt alle fachlichen Tabellen, hält sie per Supabase Realtime aktuell und schreibt Änderungen sofort sichtbar. Ohne Netz warten Änderungen in einer Warteschlange auf dem Gerät und werden der Reihe nach nachgereicht; vorübergehende Fehler werden mit wachsendem Abstand wiederholt.
- **Demo-Modus**: Ohne Supabase-Adresse läuft die App mit einem Speicher im Browser (`npm run dev`).
- Ansichten: `features/today`, `features/log`, `features/stats`, `features/records`, `features/assistant`, `features/settings`. Verlauf, Akte und Claude werden erst beim ersten Öffnen geladen; der Hintergrunddienst hält sie trotzdem offline vor.
- **Medikamente** (`features/medications`, `lib/medications.ts`): Die Liste entsteht in der App aus dem Plan, den Häkchen, den Einträgen vom Typ „Medikament“, der Chronik und den Fragen an die Klinik; `matchSubstances` ordnet Namen, Handelsnamen und Schreibweisen den Wirkstoffen des Katalogs zu (`catalog.ts`). Jede Zeile hat einen Stand (aktuell, geplant, früher, möglich). Die Wirkstoffseite zeigt Foto oder Strukturformel, die Dosis aus dem Plan (`doseInfo`), eine Erklärung der Wirkung und die Belege aus der Akte. Der Katalog enthält nur allgemeine Arzneimittelkunde und keine Angaben zu einem bestimmten Tier. Die Strukturformeln erzeugt `tools/make-structures.py` mit RDKit (`python3 tools/make-structures.py`, benötigt `pip install rdkit`); Fotos liegen in `web/src/assets/medications/` und müssen im Katalog Urheber, Lizenz und Quelle nennen.
- Fehlergrenzen (`ui/ErrorBoundary.tsx`): Ein Fehler in einem Reiter oder Fenster zeigt dort einen Hinweis mit „Erneut versuchen“ bzw. „App neu laden“; der Rest der App bleibt bedienbar.

## Gemeinsame Logik (`supabase/functions/_shared/`)

Reine Funktionen, die App und Edge Functions gleichermaßen nutzen:

| Datei | Aufgabe |
|---|---|
| `dates.ts` | Kalendertage und Uhrzeiten immer in Europe/Berlin |
| `plan.ts` | Tagesplan aus den Behandlungsplänen: Dosisstufen, jeden zweiten Tag, Wochentage, Erledigt-Status, nächste Änderung, Vorratsrechnung |
| `entryTypes.ts` | Eintragsarten, Felder, Kurztexte und Warnregeln (z. B. SpO₂, schwarzer Kot, Blut im Erbrochenen) |
| `stats.ts` | Tagesbilanzen (Trinken, Futter, Atemzüge als Median in Ruhe, SpO₂) |
| `contextText.ts` | Wissensstand für Claude aus Akte, Plan und Protokollen |

Tests dazu liegen in `web/tests/`.

## Datenbank (`supabase/migrations/`)

| Tabelle | Inhalt |
|---|---|
| `members` | Mitglieder mit Rolle (admin, member) |
| `profile` | Stammdaten als JSON (eine Zeile) |
| `regimens` | Behandlungspläne mit Uhrzeiten (`slots`) und Zeiträumen (`steps`) |
| `checks` | Häkchen je Tag und Planpunkt, mit Uhrzeit und Person |
| `entries` | Protokolleinträge (Art, Uhrzeit, Werte als JSON) |
| `days` | Tagesnotiz, Nacht, Summen vom Papierprotokoll |
| `photos` | Fotos der Papierprotokolle und das Ergebnis des Auslesens |
| `documents`, `labs`, `events`, `questions` | Akte |
| `assistant_messages` | Claude-Gespräche, nur für die jeweilige Person sichtbar |
| `push_subscriptions`, `push_log` | Push-Abos je Gerät und bereits gesendete Erinnerungen |

Zugriffsregeln (Row Level Security): Nur eingetragene Mitglieder lesen und schreiben; Mitglieder verwalten nur Admins; Gespräche und Push-Abos nur die eigene Person. Selbstregistrierung ist abgeschaltet, Konten legt ein Admin in der App an.

## Edge Functions (`supabase/functions/`)

| Function | Aufgabe |
|---|---|
| `assistant` | beantwortet Fragen mit Streaming; der feste Teil der Akte wird zwischengespeichert (Prompt Caching). Ein Foto zur Frage (JPEG/PNG/WebP, in der App auf 1568 px verkleinert) geht als Bildblock mit; höchstens die zwei jüngsten Fotos eines Gesprächs, gespeichert wird nur der Text |
| `extract` | liest Protokollfotos und Befunde (PDF, Fotos) mit Claude strukturiert aus; die App zeigt das Ergebnis zur Prüfung |
| `push-key` | liefert den öffentlichen Push-Schlüssel |
| `push-tick` | wird alle fünf Minuten von pg_cron aufgerufen und sendet fällige Erinnerungen; mit Anmeldung auch eine Probe |
| `admin-users` | Mitglieder anlegen, ändern, entfernen; beim Bereitstellen das erste Admin-Konto |

Alle Functions prüfen Anmeldung und Mitgliedschaft selbst.

## Bereitstellung (`.github/workflows/deploy.yml`)

Prüfen (Typen, Tests, `deno check`, Probe-Build) → Datenbank-Migrationen → Secrets über die Supabase Management API → Functions → Zeitplan und Anmeldeeinstellungen → Admin-Konto → Build mit Projektadresse und öffentlichem Schlüssel → GitHub Pages.

## Datenschutz

- Keine Befunde, Protokolle oder Namen im Repository; die Akte kommt über eine Importdatei in die Datenbank.
- Datenbank und Dateien liegen im Rechenzentrum Frankfurt. Fotos und PDFs sind privat und nur über kurzlebige signierte Adressen abrufbar.
- An die Claude API gehen nur die Inhalte, die für eine Frage oder ein Auslesen nötig sind.
