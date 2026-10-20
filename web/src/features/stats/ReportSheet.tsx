// Bericht für die Klinik: Zeitraum wählen, Text prüfen, teilen oder kopieren.

import { useMemo, useState } from "react";
import { Sheet, useToast } from "../../ui/overlays";
import { Chips, Field, Toggle } from "../../ui/controls";
import { Icon } from "../../ui/Icon";
import { useChecks, useDayNotes, useEntries, useEvents, usePhotos, useProfile, useQuestions, useRegimens } from "../../lib/data";
import { useMembers } from "../../lib/session";
import { addDays, daysBetween, fmtDM, type BerlinNow } from "@shared/dates.ts";
import { therapyStart } from "@shared/plan.ts";
import { clinicReport } from "../../lib/report";
import { copyText, downloadText } from "../../lib/files";

type Span = "klinik" | "therapie" | "7" | "14" | "30";

export function ReportSheet({ now, onClose }: { now: BerlinNow; onClose: () => void }) {
  const regimens = useRegimens();
  const checks = useChecks();
  const entries = useEntries();
  const photos = usePhotos();
  const notes = useDayNotes();
  const members = useMembers();
  const profile = useProfile();
  const questions = useQuestions();
  const events = useEvents();
  const toast = useToast();

  const start = useMemo(() => therapyStart(regimens), [regimens]);
  const lastVisit = useMemo(
    () =>
      events
        .filter((e) => e.category === "klinik" && e.date <= now.day)
        .map((e) => e.date)
        .sort()
        .pop() || null,
    [events, now.day],
  );
  const options: [Span, string][] = [
    ...(lastVisit && daysBetween(lastVisit, now.day) <= 90 ? [["klinik", `seit Klinik ${fmtDM(lastVisit)}`] as [Span, string]] : []),
    ...(start && start <= now.day && start !== lastVisit ? [["therapie", `seit Therapiebeginn ${fmtDM(start)}`] as [Span, string]] : []),
    ["7", "7 Tage"],
    ["14", "14 Tage"],
    ["30", "30 Tage"],
  ];
  const [chosen, setSpan] = useState<Span>(options[0][0]);
  const [withProblems, setWithProblems] = useState(false);
  const [withQuestions, setWithQuestions] = useState(true);
  // Fällt eine Auswahl weg (Klinikbesuch gelöscht, Plan pausiert), auf 7 Tage zurückfallen.
  const span: Span = options.some((o) => o[0] === chosen) ? chosen : "7";

  const from = span === "klinik" && lastVisit ? lastVisit : span === "therapie" && start ? start : addDays(now.day, -((parseInt(span, 10) || 7) - 1));
  const text = useMemo(
    () => clinicReport({ regimens, checks, entries, photos, days: notes, members, profile, questions }, from, now.day, now, { problems: withProblems, questions: withQuestions }),
    [regimens, checks, entries, photos, notes, members, profile, questions, from, now, withProblems, withQuestions],
  );
  const name = profile?.data?.name || "Spotty";
  const title = `${name} – Verlaufsbericht`;

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title, text });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    const ok = await copyText(text);
    toast.show(ok ? "Teilen geht hier nicht – Bericht wurde kopiert" : "Teilen nicht möglich", { error: !ok });
  };

  return (
    <Sheet
      title="Bericht für die Klinik"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn ghost"
            onClick={async () => {
              const ok = await copyText(text);
              toast.show(ok ? "Bericht kopiert" : "Kopieren nicht möglich", { error: !ok });
            }}
          >
            <Icon name="copy" size={20} /> Kopieren
          </button>
          <button className="btn primary" style={{ flex: 2 }} onClick={share}>
            <Icon name="send" size={20} /> Teilen
          </button>
        </>
      }
    >
      <p className="hint">Fasst Behandlung, Atemzüge, Sättigung, Gewicht, Trinken, Futter und Auffälligkeiten zusammen. Vor dem Senden bitte einmal durchlesen.</p>
      <Field label="Zeitraum">
        <Chips options={options} value={span} onChange={(v) => v && setSpan(v as Span)} allowEmpty={false} />
      </Field>
      <div className="stack-s">
        <Toggle label="Problemliste voranstellen" hint="Für eine Praxis, die den Hund noch nicht kennt." checked={withProblems} onChange={setWithProblems} />
        <Toggle label="Offene Fragen anhängen" checked={withQuestions} onChange={setWithQuestions} />
      </div>
      <pre className="report-preview" aria-label="Vorschau des Berichts">
        {text}
      </pre>
      <button className="link-btn" style={{ alignSelf: "flex-start" }} onClick={() => downloadText(`${name}_Bericht_${from}_${now.day}.txt`, text)}>
        <Icon name="download" size={18} /> Als Textdatei speichern
      </button>
    </Sheet>
  );
}
