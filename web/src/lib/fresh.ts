// „Neu seit dem letzten Blick“: Einträge und Fotos, die andere angelegt haben.

export interface FreshRow {
  created_by?: string | null;
  created_at?: string;
  inserted_at?: string | null;
  source?: string;
}

/** Maßgeblich ist, wann die Zeile den Server erreicht hat (inserted_at); ältere Zeilen ohne diesen Wert nutzen created_at. Importierte Akte-Einträge zählen nicht. */
export function isFreshFor(r: FreshRow, me: string | null | undefined, since: number): boolean {
  if (!since || !r.created_by || r.created_by === me || r.source === "import") return false;
  return Date.parse(r.inserted_at || r.created_at || "") > since;
}
