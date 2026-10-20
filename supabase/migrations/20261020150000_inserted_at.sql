-- Zeitpunkt, zu dem ein Eintrag oder Foto den Server erreicht hat.
-- Grundlage für „neu seit dem letzten Blick“: Offline angelegte Einträge zählen ab dem Nachsenden,
-- und abweichende Uhren der Geräte spielen keine Rolle. Bestehende Zeilen bleiben leer,
-- damit ältere Einträge nicht nachträglich als neu erscheinen.

alter table public.entries add column if not exists inserted_at timestamptz;
alter table public.entries alter column inserted_at set default now();

alter table public.photos add column if not exists inserted_at timestamptz;
alter table public.photos alter column inserted_at set default now();
