// Gemeinsame Datentypen für App und Edge Functions. Spaltennamen entsprechen der Datenbank.

export type Category = "med" | "inh" | "feed" | "mess" | "foto" | "care";
export type Measure = "atem" | "spo2" | "gewicht";
export type Pattern = "daily" | "alternate" | "weekdays";

export interface Slot {
  key: string;
  time: string;
  label?: string | null;
}

export interface Step {
  from: string;
  to: string | null;
  dose?: string | null;
  label?: string | null;
  amount?: number | null;
  pattern?: Pattern;
  anchor?: string | null;
  weekdays?: number[] | null;
}

export interface Regimen {
  id: string;
  name: string;
  category: Category;
  purpose?: string | null;
  instructions?: string | null;
  unit?: string | null;
  measure?: Measure | null;
  slots: Slot[];
  steps: Step[];
  active: boolean;
  notify: boolean;
  sort: number;
  stock?: number | null;
  stock_at?: string | null;
  note?: string | null;
  updated_at?: string;
  updated_by?: string | null;
}

export type ItemKind = "check" | "mess" | "foto";

export interface PlanItem {
  slot: string;
  regimenId: string;
  kind: ItemKind;
  category: Category;
  time: string;
  title: string;
  detail: string;
  dose: string | null;
  amount: number | null;
  measure: Measure | null;
  notify: boolean;
  slotLabel: string | null;
}

export interface Check {
  day: string;
  slot: string;
  time: string;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export type EntryType =
  | "atem"
  | "spo2"
  | "gewicht"
  | "trinken"
  | "futter"
  | "kot"
  | "urin"
  | "gassi"
  | "erbrechen"
  | "husten"
  | "med"
  | "notiz";

export interface Entry {
  id: string;
  day: string;
  time: string;
  type: EntryType;
  data: Record<string, unknown>;
  slot?: string | null;
  ack?: boolean;
  source?: string;
  created_by?: string | null;
  created_at?: string;
  updated_by?: string | null;
  updated_at?: string;
}

export interface DayNote {
  day: string;
  nacht?: string | null;
  paper_ml?: number | null;
  paper_g?: number | null;
  note?: string | null;
  updated_by?: string | null;
  updated_at?: string;
}

export interface Photo {
  id: string;
  day: string;
  time: string;
  path: string;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  note?: string | null;
  extraction?: unknown;
  created_by?: string | null;
  created_at?: string;
}

export interface DocFile {
  path: string;
  name: string;
  mime: string;
  bytes?: number | null;
}

export interface Finding {
  label: string;
  text: string;
  level?: "info" | "warn" | "crit";
}

export interface Doc {
  id: string;
  title: string;
  doc_date: string | null;
  issuer: string | null;
  kind: string;
  summary: string | null;
  findings: Finding[];
  files: DocFile[];
  status: "ok" | "original_fehlt" | "ausstehend";
  source?: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Lab {
  id: string;
  document_id: string | null;
  date: string;
  grp: string | null;
  param: string;
  code: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: "H" | "L" | null;
  device: string | null;
  note: string | null;
}

export interface TimelineEvent {
  id: string;
  date: string;
  time: string | null;
  title: string;
  text: string | null;
  category: string;
  document_id: string | null;
}

export interface Question {
  id: string;
  text: string;
  sort: number;
  status: "offen" | "geklaert";
  answer: string | null;
  answered_by?: string | null;
  answered_at?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface Member {
  user_id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

export interface ProfileData {
  name?: string;
  species?: string;
  breed?: string;
  sex?: string;
  born?: string;
  owner?: string;
  weight_normal?: string;
  weights?: { date: string; kg: number; source?: string | null; note?: string | null }[];
  residences?: { from: string; to: string | null; place: string; note?: string | null }[];
  allergies?: { source: string; items: string[] }[];
  history?: { date: string; text: string }[];
  problems?: { id: string; title: string; status?: string | null; since?: string | null; details?: string | null; sources?: string[] }[];
  contacts?: { name: string; role?: string | null; phone?: string | null; address?: string | null; note?: string | null }[];
  devices?: { name: string; note?: string | null }[];
  care_notes?: string[];
  guiding_principle?: string;
  family?: string;
  notes?: string;
}

export interface Profile {
  id: number;
  data: ProfileData;
  updated_at?: string;
  updated_by?: string | null;
}
