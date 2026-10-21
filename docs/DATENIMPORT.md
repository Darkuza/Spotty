# Datenimport

Die Akte wird nicht im Repository gespeichert. Sie entsteht außerhalb (Ordner `data-private/`, von Git ignoriert) und wird in der App eingelesen: **Profil (rundes Bild oben rechts) → Akte importieren**.

## Bundle-Datei bauen

```bash
node tools/build-bundle.mjs            # schreibt data-private/spotty-akte.json
node tools/build-bundle.mjs data-private/nachtrag.json --from data-private/teil.json
                                       # Nachtrag nur aus einer Teilakte (ohne Stammdaten und Plan)
```

Eingaben:

| Datei | Inhalt |
|---|---|
| `data-private/akte.json` | Stammdaten, Dokumente (mit Pfad zur Originaldatei), Laborwerte, Chronik, Fragen, Protokolleinträge, Fotos |
| `data-private/regimens.json` | Behandlungsplan (Medikamente, Inhalation, Messungen) |
| `data-private/profile-extra.json` | optional: Ergänzungen der Stammdaten, z. B. `family` |

Das Skript bettet PDFs und Fotos base64-kodiert ein; Fotos werden auf 2400 px verkleinert, wenn das Paket `sharp` vorhanden ist.

## Format (Version 1)

```json
{
  "format": "spotty-akte",
  "version": 1,
  "profile": { "name": "…", "born": "JJJJ-MM-TT", "owner": "…", "problems": [], "contacts": [], "allergies": [], "care_notes": [], "guiding_principle": "…", "family": "…" },
  "regimens": [ { "id": "…", "name": "…", "category": "med|inh|feed|mess|foto|care", "slots": [ { "key": "…", "time": "HH:MM", "label": null } ], "steps": [ { "from": "JJJJ-MM-TT", "to": null, "dose": "…", "amount": 1, "pattern": "daily|alternate|weekdays" } ], "active": true, "notify": true, "sort": 10 } ],
  "documents": [ { "id": "kurzname-datum", "title": "…", "doc_date": "JJJJ-MM-TT", "issuer": "…", "kind": "befund|labor|bildgebung|bericht|rechnung|plan|test|sonstiges", "summary": "…", "findings": [ { "label": "…", "text": "…", "level": "info|warn|crit" } ], "status": "ok|original_fehlt|ausstehend", "files": [ { "name": "…", "mime": "application/pdf", "data": "<base64>" } ] } ],
  "labs": [ { "document_id": "…", "date": "JJJJ-MM-TT", "grp": "Hämatologie", "param": "Hämatokrit", "code": "HCT", "value": 50.6, "value_text": null, "unit": "%", "ref_low": 37.3, "ref_high": 61.7, "flag": null, "device": "…", "note": null } ],
  "events": [ { "date": "JJJJ-MM-TT", "time": null, "title": "…", "text": "…", "category": "klinik|diagnostik|therapie|symptom|verlauf|familie", "document_id": null } ],
  "questions": [ { "text": "…", "sort": 1, "status": "offen", "answer": null } ],
  "entries": [ { "day": "JJJJ-MM-TT", "time": "HH:MM", "type": "atem|spo2|gewicht|trinken|futter|kot|urin|gassi|erbrechen|husten|med|notiz", "data": {} } ],
  "photos": [ { "day": "JJJJ-MM-TT", "time": "HH:MM", "file": "IMG_0001.jpeg", "mime": "image/jpeg", "data": "<base64>", "note": "…" } ]
}
```

## Verhalten beim Import

- Kennungen werden aus dem Inhalt berechnet. Ein zweiter Import derselben Datei legt nichts doppelt an.
- Standard „nur Neues hinzufügen“: Vorhandene Datensätze (auch in der App geänderte, z. B. beantwortete Fragen oder angepasste Dosen) bleiben unverändert.
- Ausnahme Originaldateien: Bringt die Datei zu einem vorhandenen Dokument Dateien mit, die dort noch fehlen, werden sie angehängt; „Original fehlt“ wird dann zu „liegt vor“. Text und Befunde des Dokuments bleiben unverändert.
- Nachträge können bei einem Dokument zusätzlich `previous_summary` mitgeben, den bisherigen Text. Stimmt die Zusammenfassung in der App genau damit überein (wurde dort also nicht geändert), übernimmt der Import Titel, Zusammenfassung und Einzelbefunde aus der Datei, etwa nach dem Abgleich mit einem nachgereichten Original.
- Ein Protokolleintrag, den es mit gleichem Tag, gleicher Uhrzeit, gleicher Art und gleichem Wert schon gibt (etwa von Hand in der App eingetragen), wird nicht ein zweites Mal angelegt.
- „Vorhandenes überschreiben“ ersetzt sie durch den Stand der Datei.
- Importierte Protokolleinträge gelten als gesehen; alte Warnhinweise erscheinen nicht erneut.
