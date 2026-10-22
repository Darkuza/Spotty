// Liste der Medikamente aus Plan, Häkchen, Einträgen, Chronik und Fragen (siehe lib/medications.ts).

import { useMemo } from "react";
import { useChecks, useEntries, useEvents, useQuestions, useRegimens } from "../../lib/data";
import { useNowValue } from "../../lib/now";
import { buildMedications, type MedItem } from "../../lib/medications";

export function useMedications(): MedItem[] {
  const regimens = useRegimens();
  const entries = useEntries();
  const events = useEvents();
  const questions = useQuestions();
  const checks = useChecks();
  const now = useNowValue();
  return useMemo(() => buildMedications({ regimens, entries, events, questions, checks, today: now.day }), [regimens, entries, events, questions, checks, now.day]);
}
