-- Palestra A·B·C: promemoria delle 16:55 (stesso progetto Supabase di Impegni).
-- Da eseguire UNA volta nel SQL Editor, DOPO aver pubblicato la Edge Function
-- "palestra". Idempotente: rieseguirlo non fa danni.

-- Telefoni iscritti alle notifiche. Nessuna regola per anon/authenticated:
-- dal browser non si legge né si scrive, passa tutto dalla funzione.
create table if not exists public.palestra_push (
  endpoint      text primary key,
  p256dh        text not null,
  auth          text not null,
  dispositivo   text,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
alter table public.palestra_push enable row level security;

-- Un giorno = una riga: impedisce doppioni e tiene l'esito dell'invio.
create table if not exists public.palestra_invii (
  giorno     date primary key,
  inviato_il timestamptz not null default now(),
  esito      jsonb not null default '{}'::jsonb
);
alter table public.palestra_invii enable row level security;

grant all on table public.palestra_push  to service_role;
grant all on table public.palestra_invii to service_role;

-- pg_cron lavora in UTC: alle 14:55 e alle 15:55 UTC chiama la funzione,
-- che parte solo quando a Roma sono le 16:55 (ora legale o solare).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'palestra-promemoria') then
    perform cron.unschedule('palestra-promemoria');
  end if;
end $$;

select cron.schedule(
  'palestra-promemoria',
  '55 14,15 * * *',
  $$
  select net.http_post(
    url     := 'https://siifawqmapfdybhvyeyi.supabase.co/functions/v1/palestra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpaWZhd3FtYXBmZHliaHZ5ZXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTM0ODQsImV4cCI6MjEwNjU4OTQ4NH0.DO905PmXOvOzBKVH1HJT-DPa-kDNHeDHSH78EkZdzKM'
    ),
    body    := '{"cron": true}'::jsonb
  );
  $$
);

-- Controllo: deve comparire una riga 'palestra-promemoria'.
select jobname, schedule, active from cron.job where jobname = 'palestra-promemoria';
