// Anweisungen und JSON-Schemata für das Auslesen von Protokollfotos und Dokumenten mit Claude.

export const ENTRY_TYPES = ["atem", "spo2", "gewicht", "trinken", "futter", "kot", "urin", "gassi", "erbrechen", "husten", "med", "notiz"];

export const LAB_CODES =
  "HCT Hämatokrit, HGB Hämoglobin, RBC Erythrozyten, MCV, MCH, MCHC, RDW, RETIC Retikulozyten (Anzahl), RETICP (%), RETHGB Retikulozytenhämoglobin, WBC Leukozyten, NEU/NEUP Neutrophile, LYM/LYMP Lymphozyten, MONO/MONOP Monozyten, EOS/EOSP Eosinophile, BASO/BASOP Basophile, PLT Thrombozyten, MPV, PDW, PCT Thrombokrit, UREA Harnstoff, CREA Kreatinin, PHOS Phosphat, NA Natrium, K Kalium, NAK Na/K, CL Chlorid, CA Calcium, TBIL Bilirubin, ALT, ALKP alkalische Phosphatase, GLU Glukose, TP Gesamteiweiß, ALB Albumin, GLOB Globulin, ALBGLOB Alb/Glob, T4, TSH, SDMA, CHOL Cholesterin, CRP, LIPASE, B12 Cobalamin, FOLAT";

export const PROTOCOL_SYSTEM = `Du liest das Foto eines handschriftlichen Tagesprotokolls über einen kranken Hund und überträgst jede Zeile in strukturierte Einträge.
Regeln:
- Übertrage nur, was auf dem Blatt steht. Nichts ergänzen, nichts schätzen. Unleserliches als "unsicher": true markieren und in "hinweise" nennen.
- Uhrzeit "HH:MM"; bei Zeitspannen (10:30–11:15) den Beginn nehmen und die Spanne in data.text vermerken.
- Eine Zeile kann mehrere Einträge ergeben (z. B. Wasser und Tablette).
- Typen und Felder:
  trinken: {"ml": Zahl, "art": "Wasser"|"Hühnerbrühe"|"Leberwurstwasser"|"Milch-Wasser"|"Sonstiges", "weg": "spritze"|"selbst"}  (Spritze/Oralspritze/Kanüle = spritze; aus Schale/Napf selbst = selbst)
  futter: {"g": Zahl (nur wenn Gramm angegeben), "menge": Text wie "2 TL" oder "1 Handvoll" (wenn keine Gramm), "art": "Nassfutter"|"Huhn"|"Frischkäse"|"Leberwurst"|"Kartoffel"|"Trockenfutter"|"Sonstiges", "reaktion": "unauffällig"|"Schmerzreaktion"|"Übelkeit"|"abgelehnt"}
  kot: {"form": "fest"|"geformt, weich"|"breiig"|"flüssig", "farbe": "braun"|"hell / orange"|"dunkelbraun"|"schwarz, klebrig", "auff": ["Schleim","frisches Blut"], "menge": "klein"|"mittel"|"groß"}
  urin: {"menge": "wenig"|"normal"|"viel"}
  gassi: {"min": Dauer in Minuten, "energie": "gut"|"mittel"|"niedrig"}
  erbrechen: {"inhalt": Text, "blut": "nein"|"ja"}
  husten: {"anzahl": Zahl, "art": Text}
  atem: {"bpm": Atemzüge pro Minute, "zustand": "schlaeft"|"ruhig"|"aktiv", "o2": "ja"|"nein"}
  spo2: {"pct": Zahl, "puls": Zahl}
  gewicht: {"kg": Zahl}
  notiz: {"tags": [], "text": Beobachtung}
  Zu jedem Eintrag darf data.text eine kurze Ergänzung enthalten.
- Medikamente (Tabletten, Pulver, Säfte, Sprays, Inhalation) NICHT als Eintrag, sondern in "medikamente" mit Uhrzeit, Name und Menge – die App gleicht sie mit dem Behandlungsplan ab.
- Abkürzungen: TL = Teelöffel, Tbl. = Tablette, ml = Milliliter, „Schmerz“ = Schmerzmittel, „Übelkeit“ = Mittel gegen Übelkeit. Eigene Begriffe der Familie stehen in den Pflegehinweisen, die mit dem Foto mitgeschickt werden.`;

export const DOCUMENT_SYSTEM = `Du wertest ein tierärztliches Dokument über einen Hund aus (Befund, Bericht, Laborausdruck, Rechnung, Plan) und legst es strukturiert in der Akte ab.
Regeln:
- Übernimm nur, was im Dokument steht; nichts erfinden, Werte exakt übernehmen (Komma als Dezimaltrennzeichen in Zahlen umwandeln: 50,6 → 50.6).
- summary: 5 bis 10 Sätze Klartext auf Deutsch: Anlass, wichtigste Befunde, Beurteilung, Empfehlungen und vereinbartes Vorgehen.
- findings: die zentralen Einzelbefunde mit kurzer Überschrift; level "crit" für schwerwiegende, "warn" für abklärungsbedürftige, sonst "info".
- labs: jeder Laborwert mit Parametername, Code (falls passend aus dieser Liste: ${LAB_CODES}; sonst null), Zahlenwert oder value_text (z. B. "<20"), Einheit, Referenzbereich und flag "H"/"L" nur wenn außerhalb der Referenz.
- events: datierte Ereignisse aus dem Dokument (Vorstellung, Untersuchung, Behandlung), category "klinik"|"diagnostik"|"therapie"|"symptom"|"verlauf".
- fragen: offene Punkte, die die Familie mit der Klinik klären sollte (höchstens 5), nur wenn sie sich aus dem Dokument ergeben.`;

// Schemata für Structured Outputs: jedes Objekt mit additionalProperties false, feste Felder.
const S = { type: "string" } as const;
const N = { type: "number" } as const;
const SA = { type: "array", items: { type: "string" } } as const;

/** Felder aller Eintragsarten; je Eintrag werden nur die passenden gesetzt. */
const ENTRY_DATA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ml: N, art: S, weg: S, g: N, menge: S, reaktion: S,
    form: S, farbe: S, auff: SA,
    min: N, langsam: N, energie: S, atemDanach: S,
    inhalt: S, blut: S, anzahl: N,
    bpm: N, zustand: S, o2: S,
    pct: N, puls: N, pulsOk: S, stelle: S,
    kg: N, name: S, dosis: S, grund: S,
    tags: SA, text: S,
  },
};

export const PROTOCOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    datum: { type: ["string", "null"], description: "Datum des Protokolls (JJJJ-MM-TT), falls lesbar" },
    eintraege: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          time: { type: "string", description: "HH:MM" },
          type: { type: "string", enum: ENTRY_TYPES },
          data: ENTRY_DATA,
          original: { type: "string", description: "Zeile wie auf dem Blatt" },
          unsicher: { type: "boolean" },
        },
        required: ["time", "type", "data", "original", "unsicher"],
      },
    },
    medikamente: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { time: S, name: S, menge: S, original: S },
        required: ["time", "name", "menge", "original"],
      },
    },
    hinweise: S,
  },
  required: ["datum", "eintraege", "medikamente", "hinweise"],
};

export const DOCUMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: S,
    doc_date: { type: ["string", "null"], description: "JJJJ-MM-TT" },
    issuer: { type: ["string", "null"], description: "Einrichtung und Person" },
    kind: { type: "string", enum: ["befund", "labor", "bildgebung", "bericht", "rechnung", "plan", "test", "sonstiges"] },
    summary: S,
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { label: S, text: S, level: { type: "string", enum: ["info", "warn", "crit"] } },
        required: ["label", "text", "level"],
      },
    },
    labs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          grp: { type: ["string", "null"] },
          param: S,
          code: { type: ["string", "null"] },
          value: { type: ["number", "null"] },
          value_text: { type: ["string", "null"] },
          unit: { type: ["string", "null"] },
          ref_low: { type: ["number", "null"] },
          ref_high: { type: ["number", "null"] },
          flag: { type: ["string", "null"], enum: ["H", "L", null] },
        },
        required: ["grp", "param", "code", "value", "value_text", "unit", "ref_low", "ref_high", "flag"],
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: S,
          time: { type: ["string", "null"] },
          title: S,
          text: { type: ["string", "null"] },
          category: { type: "string", enum: ["klinik", "diagnostik", "therapie", "symptom", "verlauf"] },
        },
        required: ["date", "time", "title", "text", "category"],
      },
    },
    fragen: SA,
  },
  required: ["title", "doc_date", "issuer", "kind", "summary", "findings", "labs", "events", "fragen"],
};
