// Mengenangaben in Dosierungen.

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
const COUNT_WORDS = /^(hub|hübe|hube|sprühstoß|sprühstöße|pumpstoß|pumpstöße|tablette|tabletten|tbl|beutel|kapsel|kapseln|tropfen|stück|stk)\b/;

/**
 * Menge je Gabe (in der Einheit des Plans) aus dem Anfang der Dosis lesen:
 * „2 Hübe“ → 2, „½ Tablette“ → 0,5, „1¼“ → 1,25, „1,5 ml“ bei Einheit ml → 1,5.
 * Eine Wirkstoffmenge wie „20 mg“ ist keine Stückzahl und ergibt null.
 */
export function amountOf(dose: string, unit?: string | null): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔⅛])?\s*(.*)$/.exec(dose || "");
  if (!m || (!m[1] && !m[2])) return null;
  const rest = m[3].trim().toLowerCase();
  const stem = (unit || "").trim().toLowerCase().slice(0, 3);
  const countable = rest === "" || COUNT_WORDS.test(rest) || (stem.length >= 2 && rest.startsWith(stem));
  if (!countable) return null;
  const n = (m[1] ? Number(m[1].replace(",", ".")) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
  return n > 0 ? Math.round(n * 1000) / 1000 : null;
}
