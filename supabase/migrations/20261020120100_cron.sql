-- Zeitplan für Push-Erinnerungen: alle 5 Minuten die Funktion push-tick aufrufen.
-- Adresse und Geheimnis stehen in private.config und werden beim Deployment gesetzt.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('spotty-push-tick');
exception when others then
  null;
end
$$;

select cron.schedule(
  'spotty-push-tick',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select value from private.config where key = 'functions_url') || '/push-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce((select value from private.config where key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  )
  where exists (select 1 from private.config where key = 'functions_url');
  $job$
);

-- Alte Protokolle der Erinnerungen nach 30 Tagen löschen.
do $$
begin
  perform cron.unschedule('spotty-push-log-cleanup');
exception when others then
  null;
end
$$;

select cron.schedule(
  'spotty-push-log-cleanup',
  '17 3 * * *',
  $job$ delete from public.push_log where sent_at < now() - interval '30 days'; $job$
);
