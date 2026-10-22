// Medikamente wie in Health: Liste aller Mittel, die Spotty bekommt, bekommen soll oder bekommen hat.
// Antippen öffnet die Wirkstoffseite. Der Tagesplan mit „Protokollieren“ liegt eine Ebene tiefer.

import { openSub } from "../../lib/route";
import { useNowValue } from "../../lib/now";
import { useSheets } from "../../ui/overlays";
import { CapsuleRow, CircleButton, EmptyCard, Group, NavBar, Row, Screen, SectionHead } from "../../ui/ios";
import { catColor } from "../../lib/health/metrics";
import { STATUS_TITLE, glyphOf, rowSub, sectionsOf, type MedStatus } from "../../lib/medications";
import { PlanSheet } from "../settings/PlanEditor";
import { keepUnits } from "../plan/MedsPage";
import { useMedications } from "./useMedications";

const FOOTER: Partial<Record<MedStatus, string>> = {
  aktuell: "Dosierungen ändert nur die behandelnde Klinik.",
  moeglich: "In der Akte erwähnt oder in Fragen an die Klinik gestellt, bisher nicht im Plan.",
};

export function MedicationList({ back }: { back: string }) {
  const items = useMedications();
  const now = useNowValue();
  const sheets = useSheets();
  const sections = sectionsOf(items);
  return (
    <Screen tint={catColor("medikamente")}>
      <NavBar title="Medikamente" large back={back} trailing={<CircleButton icon="edit" label="Plan bearbeiten" onClick={() => sheets.open((close) => <PlanSheet onClose={close} />)} />} />
      <CapsuleRow glyph="calendar" color="var(--c-medikamente)" label="Tagesplan und Protokoll" onClick={() => openSub("tagesplan")} />
      {!sections.length ? <EmptyCard title="Noch keine Medikamente">Sie erscheinen mit dem Import der Akte, mit dem Plan oder mit den Einträgen.</EmptyCard> : null}
      {sections.map(({ status, items: list }) => (
        <section key={status} aria-label={STATUS_TITLE[status]}>
          <SectionHead title={STATUS_TITLE[status]} />
          <Group footer={FOOTER[status]}>
            {list.map((it) => (
              <Row
                key={it.key}
                glyph={glyphOf(it)}
                color={status === "aktuell" || status === "geplant" ? "var(--c-medikamente)" : "var(--label-3)"}
                title={it.name}
                sub={keepUnits(rowSub(it, now.day))}
                wrap
                chevron
                onClick={() => openSub(`medikamente/${it.key}`)}
              />
            ))}
          </Group>
        </section>
      ))}
    </Screen>
  );
}
