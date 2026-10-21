# Einrichtung

Alles läuft im Browser. Git-Befehle sind nicht nötig; Schlüssel und Passwörter werden nur in GitHub und Supabase eingetragen, nie in Dateien des Repositorys.

## 1. Supabase-Projekt

1. Auf [supabase.com](https://supabase.com) anmelden (z. B. mit „Continue with GitHub“).
2. **New project** → Name `spotty` → **Database Password**: „Generate a password“, im Passwortmanager speichern → Region **Central EU (Frankfurt)** → Plan Free → **Create new project**.
3. Die Projekt-Kennung steht danach in der Adresse: `supabase.com/dashboard/project/KENNUNG` (20 Zeichen).
4. Zugangs-Token: Profilbild oben rechts → **Account preferences** → **Access Tokens** → **Generate new token**, Name `github-spotty`, Wert kopieren.

## 2. Claude-API-Schlüssel

1. [console.anthropic.com](https://console.anthropic.com) → **Settings → API Keys → Create Key**, Name `spotty-app`, Wert kopieren (beginnt mit `sk-ant-`).
2. Unter **Settings → Limits** ein Monatslimit setzen, z. B. 20 €.

## 3. Secrets im Repository

Repository → **Settings** → **Secrets and variables → Actions** → **New repository secret**. Jedes Secret wird einzeln angelegt: ins Feld **Name** kommt genau ein Name aus der linken Spalte, ins Feld **Secret** der zugehörige Wert. Das wiederholt sich für jede Zeile:

| Secret | Inhalt |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token aus 1.4 |
| `SUPABASE_PROJECT_REF` | Projekt-Kennung aus 1.3 |
| `SUPABASE_DB_PASSWORD` | Datenbank-Passwort aus 1.2 |
| `ANTHROPIC_API_KEY` | Schlüssel aus 2.1 |
| `ADMIN_EMAIL` | E-Mail-Adresse für das eigene App-Konto |
| `ADMIN_PASSWORD` | Startpasswort für das eigene App-Konto (mindestens 8 Zeichen, später in der App änderbar) |
| `ADMIN_NAME` | optional: Name, unter dem Häkchen und Einträge erscheinen (sonst „Admin“, in der App änderbar) |

Optional unter **Variables**: `CLAUDE_MODEL`, falls ein anderes Claude-Modell als `claude-sonnet-5-5` verwendet werden soll.

## 4. Veröffentlichung einschalten

Repository → **Settings → Pages** → bei „Source“ **GitHub Actions** wählen.

GitHub Pages für private Repositories setzt GitHub Pro voraus; GitHub zeigt dann „Upgrade or make this repository public to enable Pages“ und noch keine Auswahl „Source“. Ohne Pro wird das Repository öffentlich gestellt (Settings → General → ganz unten „Danger Zone“ → Change repository visibility → Make public). Es enthält nur Code; Secrets bleiben auch in einem öffentlichen Repository verborgen und erscheinen in den Protokollen der Actions nur als `***`. Die Daten liegen geschützt in Supabase; ohne Konto sieht man nur die Anmeldeseite. Danach erscheint unter Pages die Auswahl „Source“.

## 5. Erste Bereitstellung

Reiter **Actions** → „Prüfen und bereitstellen“ → **Run workflow** (oder einen Commit auf `main` pushen). Der Lauf

1. prüft Typen, Tests und Edge Functions,
2. legt die Datenbank an (Tabellen, Zugriffsregeln, Dateiablage, Zeitplan für Erinnerungen),
3. setzt die Secrets der Edge Functions (Claude-Schlüssel, Push-Schlüssel werden beim ersten Mal erzeugt),
4. stellt die Edge Functions bereit, schaltet die Selbstregistrierung ab und legt das Admin-Konto an,
5. baut die App und veröffentlicht sie unter `https://BESITZER.github.io/REPOSITORY/`.

Sind alle Schritte grün, ist die App erreichbar. Schlägt ein Schritt fehl, steht der Grund im Protokoll des Schritts; meist fehlt ein Secret oder ist falsch geschrieben.

## 6. In der App

1. Mit `ADMIN_EMAIL` und `ADMIN_PASSWORD` anmelden. Über **Profil (rundes Bild oben rechts) → Passwort ändern** ein eigenes Passwort setzen.
2. **Profil → Akte importieren**: die vorbereitete Datei `spotty-akte.json` wählen (siehe [DATENIMPORT.md](DATENIMPORT.md)). Danach stehen Stammdaten, Behandlungsplan, Befunde mit Originalen, Laborwerte, Chronik, Fragen und die bisherigen Protokolle in der App.
3. **Profil → Familie → Mitglied anlegen**: Name, E-Mail und Startpasswort; die Zugangsdaten persönlich weitergeben.
4. Den eigenen Namen bei Bedarf unter **Profil → Familie** anpassen.

## 7. Auf dem iPhone

1. Die Adresse in **Safari** öffnen, anmelden.
2. Teilen → **Zum Home-Bildschirm**.
3. Spotty vom Home-Bildschirm öffnen → **Profil → Erinnerungen** einschalten und „Probe senden“ tippen.

Erinnerungen kommen zur Planzeit (Prüfung alle fünf Minuten), auf Wunsch zusätzlich nach 30 Minuten, wenn ein Medikament noch nicht abgehakt ist. Jedes Gerät wählt selbst, welche Arten es bekommt.

## Betrieb

- **Updates:** Jeder Push auf `main` stellt neu bereit. Die App zeigt „Neue Version verfügbar“.
- **Kosten:** Supabase Free genügt. Claude wird nach Verbrauch abgerechnet; das Limit aus 2.2 begrenzt die Kosten.
- **Pausieren:** Supabase pausiert kostenlose Projekte nach einer Woche ohne Nutzung. Bei täglicher Nutzung passiert das nicht; ein pausiertes Projekt lässt sich im Dashboard mit einem Klick fortsetzen.
- **Sicherung:** Profil → Sicherung herunterladen speichert alle Einträge als JSON. Fotos und PDFs liegen in der Supabase-Dateiablage.
- **Selbstregistrierung:** Wird beim Bereitstellen abgeschaltet. Falls der Schritt eine Warnung zeigt: in Supabase unter Authentication → Sign In / Providers „Allow new users to sign up“ ausschalten.
