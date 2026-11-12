-- =====================================================================
-- The Discipline Key: registratie via Supabase Auth
--  * profiles: 1-op-1 met auth.users (naam, avatar, onboarding-status),
--    automatisch aangemaakt bij registratie.
--  * E-mailverificatie verplicht: zonder bevestigd e-mailadres geen
--    beloningen, geen cloud-sync en geen migratie. Supabase laat een
--    onbevestigd account met "Confirm email" al niet inloggen; dit is de
--    tweede verdedigingslinie op de server zelf.
-- Vereist in het dashboard: Authentication > Providers > Email >
-- "Confirm email" aan. Zie docs/gamification-upgrade.md, "Uitrol".
-- =====================================================================

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text check (display_name is null or char_length(display_name) between 1 and 60),
  avatar_url        text check (avatar_url is null or avatar_url ~ '^https://'),
  onboarding_status text not null default 'nieuw' check (onboarding_status in ('nieuw', 'bezig', 'klaar')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Profiel aanmaken zodra een account wordt geregistreerd (naam uit de registratie-metadata).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), 60), ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bestaande accounts krijgen alsnog een profiel.
insert into public.profiles (id, display_name)
select u.id, nullif(left(trim(coalesce(u.raw_user_meta_data ->> 'name', '')), 60), '') from auth.users u
on conflict (id) do nothing;

create or replace function public.profiles_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.profiles_touch();

-- Is het e-mailadres van de ingelogde gebruiker bevestigd?
create or replace function public.gm_email_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
$$;

-- Alle gm_*-RPC's lopen via _gm_uid(): vanaf nu alleen voor bevestigde accounts.
create or replace function public._gm_uid() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'gm:not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from auth.users where id = v and email_confirmed_at is not null) then
    raise exception 'gm:email_unverified' using errcode = '28000';
  end if;
  return v;
end $$;
revoke execute on function public._gm_uid() from public, anon, authenticated;

-- RLS
alter table public.profiles enable row level security;
drop policy if exists own_read on public.profiles;
create policy own_read on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists own_update on public.profiles;
create policy own_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- alleen deze kolommen zijn door de gebruiker zelf aan te passen
grant update (display_name, avatar_url, onboarding_status) on public.profiles to authenticated;

-- Cloud-sync alleen voor bevestigde accounts
drop policy if exists own_read on public.user_state;
create policy own_read on public.user_state for select to authenticated
  using (user_id = (select auth.uid()) and (select public.gm_email_verified()));
drop policy if exists own_insert on public.user_state;
create policy own_insert on public.user_state for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.gm_email_verified()));
drop policy if exists own_update on public.user_state;
create policy own_update on public.user_state for update to authenticated
  using (user_id = (select auth.uid()) and (select public.gm_email_verified()))
  with check (user_id = (select auth.uid()) and (select public.gm_email_verified()));

revoke execute on function public.handle_new_user(), public.profiles_touch() from public, anon, authenticated;
revoke execute on function public.gm_email_verified() from public, anon;
grant execute on function public.gm_email_verified() to authenticated;
