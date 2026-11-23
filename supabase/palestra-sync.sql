-- Palestra A·B: sincronizzazione dei carichi tra dispositivi (stesso progetto e
-- stessi utenti di Impegni: si accede con la stessa email e password).
-- Idempotente: rieseguirlo non fa danni.

create table if not exists public.palestra_sedute (
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id               text not null,                 -- "<scheda>-<AAAA-MM-GG>", es. "a-2026-11-23"
  scheda           text not null,                 -- "a" | "b"
  data             date not null,
  esercizi         jsonb not null default '{}'::jsonb,
  salvata_il       timestamptz not null,          -- ora del salvataggio sul dispositivo: vince la più recente
  eliminata        boolean not null default false,
  sincronizzato_il timestamptz not null default now(),  -- scritto dal server: segnalibro per scaricare le novità
  primary key (user_id, id)
);
create index if not exists palestra_sedute_sync on public.palestra_sedute (user_id, sincronizzato_il);

create or replace function public.palestra_tocca_sincronizzato()
returns trigger language plpgsql as $$
begin
  new.sincronizzato_il = now();
  return new;
end $$;
drop trigger if exists palestra_sedute_sincronizzato on public.palestra_sedute;
create trigger palestra_sedute_sincronizzato
  before insert or update on public.palestra_sedute
  for each row execute function public.palestra_tocca_sincronizzato();

alter table public.palestra_sedute enable row level security;
grant select, insert, update, delete on table public.palestra_sedute to authenticated;
grant all on table public.palestra_sedute to service_role;
grant execute on function public.palestra_tocca_sincronizzato() to authenticated;
drop policy if exists "palestra: proprietario" on public.palestra_sedute;
create policy "palestra: proprietario" on public.palestra_sedute
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
