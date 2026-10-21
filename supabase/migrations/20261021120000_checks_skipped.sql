-- Planpunkte können als „ausgelassen“ markiert werden (bewusst nicht gegeben).
-- Ein ausgelassener Punkt gilt als erledigt (keine Erinnerung mehr), zählt aber nicht als Gabe.

alter table public.checks add column if not exists skipped boolean not null default false;
