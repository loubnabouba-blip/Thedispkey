-- =====================================================================
-- The Discipline Key: gamification v2 (streak-, Sparks- en kistenlogboek)
-- =====================================================================
-- Principes
--  * Logboek in plaats van herberekenen: elke streak- en beloningsgebeurtenis
--    wordt vastgelegd in streak_events / reward_events met een server-tijdstempel
--    (now() in Postgres). De telefoonklok speelt geen rol: welke dag "vandaag"
--    is, bepaalt de server met de tijdzone van het profiel.
--  * Clients schrijven nooit rechtstreeks in de spel-tabellen. Alle mutaties
--    lopen via SECURITY DEFINER-functies (gm_*), die auth.uid() controleren.
--    RLS laat gebruikers alleen hun eigen rijen lezen.
--  * Afstelbare getallen (dropkansen, prijzen, rangen) staan als JSON in
--    game_config, zodat je kunt tunen zonder nieuwe migratie.
--  * Ethische grenzen zitten in de logica: de eis blijft 3 van 4 dagdoelen;
--    toeval varieert alleen de kans en de grootte van een beloning. Rangen
--    groeien met gewonnen dagen (consistentie), nooit met trainingsvolume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.game_config (
  key   text primary key,
  value jsonb not null
);

create table if not exists public.game_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  timezone      text not null default 'Europe/Amsterdam',
  tz_changed_at timestamptz,
  started_day   date,                                  -- eerste gewonnen dag (voor de ontdekkingsweken)
  migrated_at   timestamptz,                           -- localStorage -> Supabase gedaan
  equipped      jsonb not null default '{}'::jsonb,    -- {"flame":"flame_ijs","orbit":"orbit_aurora","theme":"theme_gloed"}
  created_at    timestamptz not null default now()
);

-- Volledige app-state (zonder foto's en pincode) voor synchronisatie tussen toestellen.
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null,
  client_rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Actuele streak-stand. Wordt alleen door gm_*-functies bijgewerkt (afgeleid van streak_events).
create table if not exists public.streak_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  current          int  not null default 0 check (current >= 0),
  best             int  not null default 0 check (best >= 0),
  lifetime_won     int  not null default 0 check (lifetime_won >= 0),  -- telt nooit terug: anti-"what the hell"
  last_day         date,                    -- laatste afgehandelde dag (gewonnen, beschermd of gemist)
  freezes          int  not null default 0 check (freezes >= 0),
  chest_drought    int  not null default 0, -- gewonnen dagen sinds laatste kist (pity-teller)
  cosmetic_drought int  not null default 0, -- geopende kisten sinds laatste cosmetisch item
  broken_streak    int,                     -- verloren reeks die nog te herstellen is
  broken_day       date,
  repair_deadline  timestamptz,             -- server-tijd; daarna verloopt het herstel
  repair_won       int  not null default 0, -- gewonnen dagen binnen het herstelvenster
  last_repair_at   timestamptz,
  last_comeback_at timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  sparks          int not null default 0 check (sparks >= 0),
  lifetime_sparks int not null default 0,
  updated_at      timestamptz not null default now()
);

create table if not exists public.streak_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in (
                'day_won','freeze_earned','freeze_used','freeze_bought',
                'streak_broken','repair_completed','repair_bought','repair_expired','migrated')),
  local_day   date,
  streak_after int not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create unique index if not exists streak_events_one_win_per_day
  on public.streak_events (user_id, local_day) where kind = 'day_won';
create index if not exists streak_events_user_time on public.streak_events (user_id, created_at desc);

create table if not exists public.reward_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('sparks','chest_dropped','chest_opened','item_granted','purchase','equip')),
  sparks_delta int  not null default 0,
  source       text not null,           -- day_won | chest | jackpot | shop | migration | duplicate
  ref_id       text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists reward_events_user_time on public.reward_events (user_id, created_at desc);

create table if not exists public.shop_items (
  id          text primary key,
  kind        text not null check (kind in ('freeze','flame','orbit','theme')),
  name        text not null,
  description text not null default '',
  price       int check (price is null or price > 0),   -- null = alleen uit kisten
  rarity      text not null default 'brons' check (rarity in ('brons','zilver','goud')),
  min_rank    int  not null default 1,
  in_chests   boolean not null default true,
  sort        int  not null default 0,
  active      boolean not null default true,
  style       jsonb not null default '{}'::jsonb        -- weergave-hints voor de client
);

create table if not exists public.inventory (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     text not null references public.shop_items(id),
  source      text not null check (source in ('shop','chest','gift')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.chests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tier       text not null check (tier in ('brons','zilver','goud')),
  reason     text not null,              -- welkom | mijlpaal | comeback | toeval | migratie
  local_day  date,
  dropped_at timestamptz not null default now(),
  opened_at  timestamptz,
  contents   jsonb
);
create index if not exists chests_unopened on public.chests (user_id) where opened_at is null;

-- ---------------------------------------------------------------------
-- 2. Configuratie en catalogus
-- ---------------------------------------------------------------------

insert into public.game_config (key, value) values ('rules', $json$
{
  "day_sparks": { "base": 8, "perfect_bonus": 4, "per_rank": 2 },
  "drop": { "base": 0.12, "per_drought_day": 0.07, "perfect": 0.08, "discovery": 0.12,
            "discovery_from_day": 7, "discovery_to_day": 21, "pity_after": 5 },
  "milestones": { "7": "zilver", "14": "zilver", "21": "goud", "30": "goud" },
  "milestone_every": { "n": 30, "tier": "goud" },
  "ranks": [
    { "rank": 1, "min_won": 0,   "name": "Vonk",      "mult": 1.00, "odds": { "brons": 80, "zilver": 18, "goud": 2 } },
    { "rank": 2, "min_won": 14,  "name": "Gloed",     "mult": 1.15, "odds": { "brons": 65, "zilver": 30, "goud": 5 } },
    { "rank": 3, "min_won": 60,  "name": "Vlam",      "mult": 1.30, "odds": { "brons": 50, "zilver": 38, "goud": 12 } },
    { "rank": 4, "min_won": 180, "name": "Vuurhaard", "mult": 1.50, "odds": { "brons": 40, "zilver": 42, "goud": 18 } }
  ],
  "chest": {
    "brons":  { "min": 8,  "max": 20,  "cosmetic": 0.06, "freeze": 0.00 },
    "zilver": { "min": 20, "max": 45,  "cosmetic": 0.15, "freeze": 0.10 },
    "goud":   { "min": 50, "max": 100, "cosmetic": 0.35, "freeze": 0.20 }
  },
  "jackpot": { "chance": 0.02, "mult": 3 },
  "duplicate_sparks": 25,
  "cosmetic_pity_after": 8,
  "freeze": { "cap": 2, "cap_from_rank": 3, "cap_high": 3, "price": 60, "earn_every": 7, "full_bonus": 20 },
  "repair": { "min_streak": 3, "window_hours": 72, "days_needed": 2,
              "base": 40, "per_day": 6, "max": 400, "cooldown_days": 30 },
  "comeback": { "tier": "zilver", "cooldown_days": 14 },
  "migration": { "per_won_day": 2, "max_sparks": 200, "max_streak": 400 }
}
$json$::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.shop_items (id, kind, name, description, price, rarity, min_rank, in_chests, sort, style) values
  ('freeze',          'freeze', 'Streakbeschermer', 'Vangt één gemiste dag op. Wordt alleen gebruikt als hij je reeks echt redt.', 60, 'brons', 1, false, 0, '{"emoji":"🧊"}'),
  ('flame_ijs',       'flame',  'IJsvlam',      'Een blauwe, ijskoude vlam.',              150, 'brons',  1, true, 10, '{"hue":190,"glow":"#5CC8FF"}'),
  ('flame_gif',       'flame',  'Gifvlam',      'Fel groen vuur.',                         150, 'brons',  1, true, 11, '{"hue":80,"glow":"#C9F24D"}'),
  ('flame_violet',    'flame',  'Nachtvlam',    'Diep violet, voor late trainingen.',      250, 'zilver', 2, true, 12, '{"hue":250,"glow":"#9A8CFF"}'),
  ('flame_goud',      'flame',  'Gouden vlam',  'Goud dat flikkert. Alleen voor wie volhoudt.', 450, 'goud', 3, true, 13, '{"hue":20,"glow":"#FFD166","sat":1.6}'),
  ('flame_regenboog', 'flame',  'Prismavlam',   'Verschuift langzaam door alle kleuren.',  null, 'goud',   2, true, 14, '{"anim":"prisma","glow":"#FF5C8A"}'),
  ('orbit_aurora',    'orbit',  'Aurora-orbit', 'Banen die zacht van kleur verlopen.',     200, 'zilver', 1, true, 20, '{"orb":"aurora"}'),
  ('orbit_sterren',   'orbit',  'Sterrenstof',  'Fonkelende stippen rond je vlam.',        300, 'zilver', 2, true, 21, '{"orb":"sterren"}'),
  ('orbit_zon',       'orbit',  'Zonnecorona',  'Een gouden corona om je orbit.',          null, 'goud',   3, true, 22, '{"orb":"zon"}'),
  ('theme_gloed',     'theme',  'Gloed',        'Warm oranje accent door de hele app.',    180, 'brons',  1, true, 30, '{"pg":"#FF8A3D"}'),
  ('theme_oceaan',    'theme',  'Oceaan',       'Koel blauw accent door de hele app.',     180, 'brons',  1, true, 31, '{"pg":"#5CC8FF"}'),
  ('theme_roos',      'theme',  'Roos',         'Zacht roze accent door de hele app.',     280, 'zilver', 2, true, 32, '{"pg":"#FF7AB6"}'),
  ('theme_middernacht','theme', 'Middernacht',  'Violet accent met diepe schaduwen.',      null, 'goud',   2, true, 33, '{"pg":"#9A8CFF"}')
on conflict (id) do update set
  kind = excluded.kind, name = excluded.name, description = excluded.description, price = excluded.price,
  rarity = excluded.rarity, min_rank = excluded.min_rank, in_chests = excluded.in_chests, sort = excluded.sort, style = excluded.style;

-- ---------------------------------------------------------------------
-- 3. Hulpfuncties (intern, niet aanroepbaar door clients)
-- ---------------------------------------------------------------------

create or replace function public._gm_cfg() returns jsonb
language sql stable security definer set search_path = public as
$$ select value from public.game_config where key = 'rules' $$;

create or replace function public._gm_tier_n(t text) returns int
language sql immutable as
$$ select case t when 'brons' then 1 when 'zilver' then 2 when 'goud' then 3 else 0 end $$;

create or replace function public._gm_rank(p_won int) returns jsonb
language sql stable security definer set search_path = public as $$
  select r from jsonb_array_elements(public._gm_cfg() -> 'ranks') r
  where (r ->> 'min_won')::int <= p_won
  order by (r ->> 'min_won')::int desc limit 1
$$;

create or replace function public._gm_freeze_cap(p_won int) returns int
language sql stable security definer set search_path = public as $$
  select case when (public._gm_rank(p_won) ->> 'rank')::int >= (c -> 'freeze' ->> 'cap_from_rank')::int
              then (c -> 'freeze' ->> 'cap_high')::int else (c -> 'freeze' ->> 'cap')::int end
  from (select public._gm_cfg() c) x
$$;

create or replace function public._gm_today(p_uid uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.game_profiles where user_id = p_uid), 'Europe/Amsterdam'))::date
$$;

create or replace function public._gm_repair_cost(p_streak int) returns int
language sql stable security definer set search_path = public as $$
  select least((c -> 'repair' ->> 'max')::int, (c -> 'repair' ->> 'base')::int + (c -> 'repair' ->> 'per_day')::int * p_streak)
  from (select public._gm_cfg() c) x
$$;

create or replace function public._gm_uid() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'gm:not_authenticated' using errcode = '28000'; end if;
  return v;
end $$;

create or replace function public._gm_ensure(p_uid uuid, p_tz text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.game_profiles (user_id, timezone)
    values (p_uid, coalesce(p_tz, 'Europe/Amsterdam')) on conflict do nothing;
  insert into public.streak_state (user_id) values (p_uid) on conflict do nothing;
  insert into public.wallets (user_id) values (p_uid) on conflict do nothing;
end $$;

create or replace function public._gm_add_sparks(p_uid uuid, p_n int, p_source text, p_ref text, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_n = 0 then return; end if;
  update public.wallets
     set sparks = sparks + p_n,
         lifetime_sparks = lifetime_sparks + greatest(p_n, 0),
         updated_at = now()
   where user_id = p_uid;
  insert into public.reward_events (user_id, kind, sparks_delta, source, ref_id, meta)
    values (p_uid, case when p_n < 0 then 'purchase' else 'sparks' end, p_n, p_source, p_ref, coalesce(p_meta, '{}'::jsonb));
end $$;

create or replace function public._gm_drop_chest(p_uid uuid, p_tier text, p_reason text, p_day date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.chests (user_id, tier, reason, local_day) values (p_uid, p_tier, p_reason, p_day) returning id into v_id;
  insert into public.reward_events (user_id, kind, source, ref_id, meta)
    values (p_uid, 'chest_dropped', p_reason, v_id::text, jsonb_build_object('tier', p_tier, 'day', p_day));
  return jsonb_build_object('type', 'chest', 'id', v_id, 'tier', p_tier, 'reason', p_reason);
end $$;

-- Rolt een kist-tier volgens de kansen van de rang. p_advantage: twee keer rollen, beste nemen.
create or replace function public._gm_roll_tier(p_odds jsonb, p_advantage boolean) returns text
language plpgsql volatile as $$
declare
  b int := (p_odds ->> 'brons')::int; z int := (p_odds ->> 'zilver')::int; g int := (p_odds ->> 'goud')::int;
  t text; best text := 'brons'; r float8; i int;
begin
  for i in 1 .. (case when p_advantage then 2 else 1 end) loop
    r := random() * (b + z + g);
    t := case when r < b then 'brons' when r < b + z then 'zilver' else 'goud' end;
    if public._gm_tier_n(t) > public._gm_tier_n(best) then best := t; end if;
  end loop;
  return best;
end $$;

-- Handelt alle nog niet afgehandelde dagen t/m p_upto af: verlopen herstel, beschermers, breuk.
-- Verwacht dat de aanroeper de streak_state-rij al vergrendeld heeft (FOR UPDATE).
create or replace function public._gm_settle(p_uid uuid, p_upto date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c   jsonb := public._gm_cfg();
  st  public.streak_state%rowtype;
  ev  jsonb := '[]'::jsonb;
  gap int; d date; repairable boolean;
begin
  select * into st from public.streak_state where user_id = p_uid;

  -- herstelvenster verlopen?
  if st.repair_deadline is not null and now() > st.repair_deadline then
    insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
      values (p_uid, 'repair_expired', st.broken_day, st.current, jsonb_build_object('lost', st.broken_streak));
    ev := ev || jsonb_build_object('type', 'repair_expired', 'lost', st.broken_streak);
    st.broken_streak := null; st.broken_day := null; st.repair_deadline := null; st.repair_won := 0;
  end if;

  if st.last_day is not null and p_upto > st.last_day then
    gap := p_upto - st.last_day;
    if st.current > 0 then
      if gap <= st.freezes then
        -- beschermers redden de reeks; alleen gebruiken als ze de reeks echt redden
        for d in select generate_series(st.last_day + 1, p_upto, interval '1 day')::date loop
          st.freezes := st.freezes - 1;
          insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
            values (p_uid, 'freeze_used', d, st.current, jsonb_build_object('left', st.freezes));
        end loop;
        ev := ev || jsonb_build_object('type', 'freeze_used', 'days', gap, 'left', st.freezes);
      else
        repairable := st.current >= (c -> 'repair' ->> 'min_streak')::int
          and (st.last_repair_at is null or st.last_repair_at < now() - make_interval(days => (c -> 'repair' ->> 'cooldown_days')::int));
        -- een lopend herstel van een grotere reeks niet overschrijven
        if repairable and st.repair_deadline is null then
          st.broken_streak := st.current; st.broken_day := st.last_day + 1; st.repair_won := 0;
          st.repair_deadline := now() + make_interval(hours => (c -> 'repair' ->> 'window_hours')::int);
        end if;
        insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
          values (p_uid, 'streak_broken', st.last_day + 1, 0,
                  jsonb_build_object('lost', st.current, 'repairable', st.repair_deadline is not null, 'missed_days', gap));
        ev := ev || jsonb_build_object('type', 'streak_broken', 'lost', st.current,
                  'repairable', st.repair_deadline is not null, 'deadline', st.repair_deadline);
        st.current := 0;
      end if;
    end if;
    st.last_day := p_upto;
  end if;

  update public.streak_state set
    current = st.current, last_day = st.last_day, freezes = st.freezes,
    broken_streak = st.broken_streak, broken_day = st.broken_day,
    repair_deadline = st.repair_deadline, repair_won = st.repair_won, updated_at = now()
  where user_id = p_uid;
  return ev;
end $$;

-- ---------------------------------------------------------------------
-- 4. Publieke RPC's (aanroepbaar door ingelogde gebruikers)
-- ---------------------------------------------------------------------

-- Alles wat de client nodig heeft om te tekenen, in één call.
create or replace function public.gm_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  c jsonb := public._gm_cfg();
  st public.streak_state%rowtype; w public.wallets%rowtype; p public.game_profiles%rowtype;
  t date; rk jsonb;
begin
  select * into st from public.streak_state where user_id = v_uid;
  select * into w  from public.wallets where user_id = v_uid;
  select * into p  from public.game_profiles where user_id = v_uid;
  if st.user_id is null then return null; end if;
  t := public._gm_today(v_uid);
  rk := public._gm_rank(st.lifetime_won);
  return jsonb_build_object(
    'server_now', now(),
    'today', t,
    'timezone', p.timezone,
    'migrated', p.migrated_at is not null,
    'equipped', p.equipped,
    'streak', jsonb_build_object(
      'current', st.current, 'best', st.best, 'lifetime_won', st.lifetime_won, 'last_day', st.last_day,
      'freezes', st.freezes, 'freeze_cap', public._gm_freeze_cap(st.lifetime_won),
      'won_today', exists (select 1 from public.streak_events where user_id = v_uid and kind = 'day_won' and local_day = t),
      'won_yesterday', exists (select 1 from public.streak_events where user_id = v_uid and kind = 'day_won' and local_day = t - 1),
      'repair', case when st.repair_deadline is not null and st.repair_deadline > now() then jsonb_build_object(
          'lost', st.broken_streak, 'deadline', st.repair_deadline, 'won', st.repair_won,
          'needed', (c -> 'repair' ->> 'days_needed')::int, 'cost', public._gm_repair_cost(st.broken_streak))
        else null end),
    'rank', rk || jsonb_build_object('next', (
        select r from jsonb_array_elements(c -> 'ranks') r
        where (r ->> 'min_won')::int > st.lifetime_won order by (r ->> 'min_won')::int limit 1)),
    'sparks', w.sparks,
    'lifetime_sparks', w.lifetime_sparks,
    'chests', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'tier', tier, 'reason', reason, 'day', local_day) order by dropped_at)
                        from public.chests where user_id = v_uid and opened_at is null), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(item_id) from public.inventory where user_id = v_uid), '[]'::jsonb),
    'freeze_price', (c -> 'freeze' ->> 'price')::int
  );
end $$;

-- Aanroepen bij openen van de app: maakt profiel aan, werkt tijdzone bij en handelt
-- definitieve dagen af (t/m eergisteren; gisteren is nog te claimen).
create or replace function public.gm_reconcile(p_tz text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._gm_uid(); v_ev jsonb; p public.game_profiles%rowtype;
begin
  if p_tz is not null then perform now() at time zone p_tz; end if;  -- ongeldige tijdzone -> fout
  perform public._gm_ensure(v_uid, p_tz);
  select * into p from public.game_profiles where user_id = v_uid for update;
  -- tijdzone max. eens per 7 dagen wijzigen (voorkomt "dag erbij winnen" door te wisselen)
  if p_tz is not null and p_tz <> p.timezone and (p.tz_changed_at is null or p.tz_changed_at < now() - interval '7 days') then
    update public.game_profiles set timezone = p_tz, tz_changed_at = now() where user_id = v_uid;
  end if;
  perform 1 from public.streak_state where user_id = v_uid for update;
  v_ev := public._gm_settle(v_uid, public._gm_today(v_uid) - 2);
  return jsonb_build_object('events', v_ev, 'snapshot', public.gm_snapshot());
end $$;

-- Claimt een gewonnen dag (vandaag of gisteren, volgens de serverklok).
-- p_pillars: {"train":bool,"rest":bool,"steps":bool,"protein":bool,"check":bool}
create or replace function public.gm_claim_day(p_day date, p_pillars jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  c   jsonb := public._gm_cfg();
  t   date;
  st  public.streak_state%rowtype;
  ev  jsonb := '[]'::jsonb;
  score int; perfect boolean; comeback boolean; rk jsonb; rank_n int; cap int;
  sp int; tier text; reason text; p float8; ms text; started date;
begin
  perform public._gm_ensure(v_uid);
  t := public._gm_today(v_uid);
  if p_day is null or p_day > t or p_day < t - 1 then
    raise exception 'gm:day_out_of_window' using hint = 'Alleen vandaag of gisteren kan worden geclaimd.';
  end if;

  score := (case when coalesce((p_pillars ->> 'train')::boolean, false) or coalesce((p_pillars ->> 'rest')::boolean, false) then 1 else 0 end)
         + (case when coalesce((p_pillars ->> 'steps')::boolean, false) then 1 else 0 end)
         + (case when coalesce((p_pillars ->> 'protein')::boolean, false) then 1 else 0 end)
         + (case when coalesce((p_pillars ->> 'check')::boolean, false) then 1 else 0 end);
  if score < 3 then raise exception 'gm:not_won' using hint = 'Een dag telt bij 3 van de 4 dagdoelen.'; end if;
  perfect := score = 4;

  select * into st from public.streak_state where user_id = v_uid for update;
  if exists (select 1 from public.streak_events where user_id = v_uid and kind = 'day_won' and local_day = p_day) then
    return jsonb_build_object('already', true, 'events', '[]'::jsonb, 'snapshot', public.gm_snapshot());
  end if;
  if st.last_day is not null and p_day <= st.last_day then
    return jsonb_build_object('already', true, 'settled', true, 'events', '[]'::jsonb, 'snapshot', public.gm_snapshot());
  end if;

  ev := public._gm_settle(v_uid, p_day - 1);
  select * into st from public.streak_state where user_id = v_uid;

  comeback := st.current = 0 and st.lifetime_won > 0
    and (st.last_comeback_at is null or st.last_comeback_at < now() - make_interval(days => (c -> 'comeback' ->> 'cooldown_days')::int));

  st.current := st.current + 1;
  st.lifetime_won := st.lifetime_won + 1;
  st.last_day := p_day;

  -- herstel-quest: win X dagen binnen het venster -> oude reeks komt terug
  if st.repair_deadline is not null and st.repair_deadline > now() then
    st.repair_won := st.repair_won + 1;
    if st.repair_won >= (c -> 'repair' ->> 'days_needed')::int then
      st.current := st.broken_streak + st.current;
      insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
        values (v_uid, 'repair_completed', p_day, st.current, jsonb_build_object('restored', st.broken_streak, 'via', 'quest'));
      ev := ev || jsonb_build_object('type', 'repair_completed', 'restored', st.broken_streak, 'current', st.current);
      st.broken_streak := null; st.broken_day := null; st.repair_deadline := null; st.repair_won := 0; st.last_repair_at := now();
      comeback := false;
    else
      ev := ev || jsonb_build_object('type', 'repair_progress', 'won', st.repair_won, 'needed', (c -> 'repair' ->> 'days_needed')::int);
    end if;
  end if;
  st.best := greatest(st.best, st.current);

  rk := public._gm_rank(st.lifetime_won); rank_n := (rk ->> 'rank')::int;
  cap := public._gm_freeze_cap(st.lifetime_won);

  -- beschermers: startbeschermer op dag 1, daarna elke 7 dagen op rij
  if st.lifetime_won = 1 and st.freezes < 1 then
    st.freezes := 1;
    insert into public.streak_events (user_id, kind, local_day, streak_after, meta) values (v_uid, 'freeze_earned', p_day, st.current, '{"why":"start"}');
    ev := ev || jsonb_build_object('type', 'freeze_earned', 'why', 'start');
  elsif st.current % (c -> 'freeze' ->> 'earn_every')::int = 0 then
    if st.freezes < cap then
      st.freezes := st.freezes + 1;
      insert into public.streak_events (user_id, kind, local_day, streak_after, meta) values (v_uid, 'freeze_earned', p_day, st.current, '{"why":"reeks"}');
      ev := ev || jsonb_build_object('type', 'freeze_earned', 'why', 'reeks');
    else
      perform public._gm_add_sparks(v_uid, (c -> 'freeze' ->> 'full_bonus')::int, 'day_won', p_day::text, '{"why":"beschermers vol"}');
      ev := ev || jsonb_build_object('type', 'sparks', 'amount', (c -> 'freeze' ->> 'full_bonus')::int, 'why', 'Beschermers vol');
    end if;
  end if;

  -- vaste Sparks voor de dag (groeien licht mee met de rang)
  sp := (c -> 'day_sparks' ->> 'base')::int + (rank_n - 1) * (c -> 'day_sparks' ->> 'per_rank')::int
        + case when perfect then (c -> 'day_sparks' ->> 'perfect_bonus')::int else 0 end;
  perform public._gm_add_sparks(v_uid, sp, 'day_won', p_day::text, jsonb_build_object('perfect', perfect, 'rank', rank_n));
  ev := ev || jsonb_build_object('type', 'sparks', 'amount', sp, 'why', case when perfect then 'Perfecte dag' else 'Dag gewonnen' end);

  -- kist: gegarandeerd (welkom, comeback, mijlpaal) of variabel
  tier := null; reason := null;
  if st.lifetime_won = 1 then tier := 'brons'; reason := 'welkom'; end if;
  if comeback then tier := c -> 'comeback' ->> 'tier'; reason := 'comeback'; st.last_comeback_at := now(); end if;
  ms := c -> 'milestones' ->> st.current::text;
  if ms is null and st.current > 0 and st.current % (c -> 'milestone_every' ->> 'n')::int = 0 then ms := c -> 'milestone_every' ->> 'tier'; end if;
  if ms is not null and (tier is null or public._gm_tier_n(ms) >= public._gm_tier_n(tier)) then tier := ms; reason := 'mijlpaal'; end if;
  if tier is null then
    select coalesce(started_day, p_day) into started from public.game_profiles where user_id = v_uid;
    p := (c -> 'drop' ->> 'base')::float8
       + st.chest_drought * (c -> 'drop' ->> 'per_drought_day')::float8
       + case when perfect then (c -> 'drop' ->> 'perfect')::float8 else 0 end
       + case when (p_day - started) between (c -> 'drop' ->> 'discovery_from_day')::int and (c -> 'drop' ->> 'discovery_to_day')::int
              then (c -> 'drop' ->> 'discovery')::float8 else 0 end;
    if st.chest_drought >= (c -> 'drop' ->> 'pity_after')::int or random() < p then
      tier := public._gm_roll_tier(rk -> 'odds', perfect); reason := 'toeval';
    end if;
  end if;
  if tier is not null then
    ev := ev || public._gm_drop_chest(v_uid, tier, reason, p_day);
    st.chest_drought := 0;
  else
    st.chest_drought := st.chest_drought + 1;
  end if;

  if (c -> 'milestones') ? st.current::text or st.current % 30 = 0 then
    ev := ev || jsonb_build_object('type', 'milestone', 'n', st.current);
  end if;

  insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
    values (v_uid, 'day_won', p_day, st.current, jsonb_build_object('score', score, 'perfect', perfect, 'pillars', p_pillars));
  update public.game_profiles set started_day = coalesce(started_day, p_day) where user_id = v_uid;
  update public.streak_state set
    current = st.current, best = st.best, lifetime_won = st.lifetime_won, last_day = st.last_day, freezes = st.freezes,
    chest_drought = st.chest_drought, broken_streak = st.broken_streak, broken_day = st.broken_day,
    repair_deadline = st.repair_deadline, repair_won = st.repair_won, last_repair_at = st.last_repair_at,
    last_comeback_at = st.last_comeback_at, updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object('already', false, 'events', ev, 'snapshot', public.gm_snapshot());
end $$;

-- Opent een kist. De inhoud wordt pas hier, op de server, bepaald.
create or replace function public.gm_open_chest(p_chest uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  c jsonb := public._gm_cfg();
  ch public.chests%rowtype; st public.streak_state%rowtype;
  tc jsonb; rk jsonb; sp int; jackpot boolean := false; item public.shop_items%rowtype;
  got_freeze boolean := false; v_contents jsonb; dup int := 0;
begin
  select * into ch from public.chests where id = p_chest and user_id = v_uid for update;
  if ch.id is null then raise exception 'gm:chest_not_found'; end if;
  if ch.opened_at is not null then
    return jsonb_build_object('contents', ch.contents, 'snapshot', public.gm_snapshot());
  end if;
  select * into st from public.streak_state where user_id = v_uid for update;
  tc := c -> 'chest' -> ch.tier;
  rk := public._gm_rank(st.lifetime_won);

  sp := floor(((tc ->> 'min')::int + random() * ((tc ->> 'max')::int - (tc ->> 'min')::int + 1)) * (rk ->> 'mult')::numeric)::int;
  if random() < (c -> 'jackpot' ->> 'chance')::float8 then jackpot := true; sp := sp * (c -> 'jackpot' ->> 'mult')::int; end if;

  -- cosmetisch item, met pity na N kisten zonder item; nooit dubbel
  if st.cosmetic_drought >= (c ->> 'cosmetic_pity_after')::int or random() < (tc ->> 'cosmetic')::float8 then
    select * into item from public.shop_items s
     where s.active and s.in_chests and s.kind in ('flame','orbit','theme')
       and public._gm_tier_n(s.rarity) <= public._gm_tier_n(ch.tier)
       and s.min_rank <= (rk ->> 'rank')::int
       and not exists (select 1 from public.inventory i where i.user_id = v_uid and i.item_id = s.id)
     order by random() limit 1;
    if item.id is not null then
      insert into public.inventory (user_id, item_id, source) values (v_uid, item.id, 'chest');
      insert into public.reward_events (user_id, kind, source, ref_id, meta) values (v_uid, 'item_granted', 'chest', item.id, jsonb_build_object('chest', ch.id));
      st.cosmetic_drought := 0;
    else
      dup := (c ->> 'duplicate_sparks')::int;  -- alles al in bezit: omzetten in Sparks
      st.cosmetic_drought := st.cosmetic_drought + 1;
    end if;
  else
    st.cosmetic_drought := st.cosmetic_drought + 1;
  end if;

  if random() < (tc ->> 'freeze')::float8 and st.freezes < public._gm_freeze_cap(st.lifetime_won) then
    st.freezes := st.freezes + 1; got_freeze := true;
    insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
      values (v_uid, 'freeze_earned', public._gm_today(v_uid), st.current, jsonb_build_object('why', 'kist', 'chest', ch.id));
  end if;

  perform public._gm_add_sparks(v_uid, sp + dup, case when jackpot then 'jackpot' else 'chest' end, ch.id::text, jsonb_build_object('tier', ch.tier));
  update public.streak_state set freezes = st.freezes, cosmetic_drought = st.cosmetic_drought, updated_at = now() where user_id = v_uid;

  v_contents := jsonb_build_object('tier', ch.tier, 'sparks', sp + dup, 'jackpot', jackpot, 'freeze', got_freeze,
    'item', case when item.id is not null then jsonb_build_object('id', item.id, 'kind', item.kind, 'name', item.name, 'rarity', item.rarity, 'style', item.style) else null end);
  update public.chests set opened_at = now(), contents = v_contents where id = ch.id;
  insert into public.reward_events (user_id, kind, source, ref_id, meta) values (v_uid, 'chest_opened', ch.reason, ch.id::text, v_contents);
  return jsonb_build_object('contents', v_contents, 'snapshot', public.gm_snapshot());
end $$;

-- Koopt een item uit de winkel (beschermer of cosmetisch).
create or replace function public.gm_buy(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  it public.shop_items%rowtype; st public.streak_state%rowtype; w public.wallets%rowtype;
begin
  select * into it from public.shop_items where id = p_item and active;
  if it.id is null or it.price is null then raise exception 'gm:not_for_sale'; end if;
  select * into st from public.streak_state where user_id = v_uid for update;
  select * into w from public.wallets where user_id = v_uid for update;
  if (public._gm_rank(st.lifetime_won) ->> 'rank')::int < it.min_rank then raise exception 'gm:rank_too_low'; end if;
  if w.sparks < it.price then raise exception 'gm:insufficient_sparks'; end if;
  if it.kind = 'freeze' then
    if st.freezes >= public._gm_freeze_cap(st.lifetime_won) then raise exception 'gm:freezes_full'; end if;
    update public.streak_state set freezes = freezes + 1, updated_at = now() where user_id = v_uid;
    insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
      values (v_uid, 'freeze_bought', public._gm_today(v_uid), st.current, jsonb_build_object('price', it.price));
  else
    if exists (select 1 from public.inventory where user_id = v_uid and item_id = it.id) then raise exception 'gm:already_owned'; end if;
    insert into public.inventory (user_id, item_id, source) values (v_uid, it.id, 'shop');
  end if;
  perform public._gm_add_sparks(v_uid, -it.price, 'shop', it.id, jsonb_build_object('kind', it.kind));
  return jsonb_build_object('item', it.id, 'snapshot', public.gm_snapshot());
end $$;

-- Herstelt een gebroken reeks direct met Sparks (alleen binnen het herstelvenster).
create or replace function public.gm_buy_repair() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  st public.streak_state%rowtype; w public.wallets%rowtype; cost int;
begin
  select * into st from public.streak_state where user_id = v_uid for update;
  if st.repair_deadline is null or st.repair_deadline <= now() then raise exception 'gm:no_repair_available'; end if;
  cost := public._gm_repair_cost(st.broken_streak);
  select * into w from public.wallets where user_id = v_uid for update;
  if w.sparks < cost then raise exception 'gm:insufficient_sparks'; end if;
  perform public._gm_add_sparks(v_uid, -cost, 'shop', 'repair', jsonb_build_object('restored', st.broken_streak));
  update public.streak_state set
    current = broken_streak + current, best = greatest(best, broken_streak + current),
    broken_streak = null, broken_day = null, repair_deadline = null, repair_won = 0, last_repair_at = now(), updated_at = now()
  where user_id = v_uid;
  insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
    values (v_uid, 'repair_bought', public._gm_today(v_uid), st.broken_streak + st.current, jsonb_build_object('restored', st.broken_streak, 'cost', cost));
  return jsonb_build_object('restored', st.broken_streak, 'snapshot', public.gm_snapshot());
end $$;

-- Zet een cosmetisch item aan (of een slot uit met p_item = null).
create or replace function public.gm_equip(p_slot text, p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._gm_uid(); k text;
begin
  if p_slot not in ('flame','orbit','theme') then raise exception 'gm:bad_slot'; end if;
  if p_item is not null then
    select s.kind into k from public.shop_items s join public.inventory i on i.item_id = s.id and i.user_id = v_uid where s.id = p_item;
    if k is null then raise exception 'gm:not_owned'; end if;
    if k <> p_slot then raise exception 'gm:bad_slot'; end if;
    update public.game_profiles set equipped = equipped || jsonb_build_object(p_slot, p_item) where user_id = v_uid;
  else
    update public.game_profiles set equipped = equipped - p_slot where user_id = v_uid;
  end if;
  insert into public.reward_events (user_id, kind, source, ref_id, meta) values (v_uid, 'equip', 'user', p_item, jsonb_build_object('slot', p_slot));
  return jsonb_build_object('snapshot', public.gm_snapshot());
end $$;

-- Eenmalige overzetting van de lokale (localStorage) stand bij de eerste login na de update.
-- Waarden worden begrensd: lokale data is niet te verifiëren, dus niet onbeperkt te vertrouwen.
create or replace function public.gm_migrate_local(
  p_tz text, p_state jsonb, p_current int, p_best int, p_lifetime int, p_freezes int, p_last_won date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  c jsonb := public._gm_cfg();
  p public.game_profiles%rowtype; t date; cur int; mx int; lt int; fz int; bonus int; ev jsonb := '[]'::jsonb;
begin
  if p_tz is not null then perform now() at time zone p_tz; end if;
  perform public._gm_ensure(v_uid, p_tz);
  select * into p from public.game_profiles where user_id = v_uid for update;
  if p.migrated_at is not null then
    return jsonb_build_object('already', true, 'snapshot', public.gm_snapshot());
  end if;
  t := public._gm_today(v_uid);
  mx  := (c -> 'migration' ->> 'max_streak')::int;
  -- een lokale reeks telt alleen als de laatste gewonnen dag vandaag of gisteren was
  cur := case when p_last_won between t - 1 and t then least(greatest(coalesce(p_current, 0), 0), mx) else 0 end;
  lt  := least(greatest(coalesce(p_lifetime, 0), cur), 1000);
  fz  := least(greatest(coalesce(p_freezes, 0), 0), public._gm_freeze_cap(lt));

  update public.streak_state set
    current = cur, best = least(greatest(coalesce(p_best, 0), cur), 1000), lifetime_won = lt, freezes = fz,
    last_day = case when cur > 0 then p_last_won else t - 1 end, updated_at = now()
  where user_id = v_uid;
  update public.game_profiles set migrated_at = now(),
    started_day = case when lt > 0 then t - lt else null end where user_id = v_uid;
  insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
    values (v_uid, 'migrated', t, cur, jsonb_build_object('current', p_current, 'best', p_best, 'lifetime', p_lifetime, 'freezes', p_freezes, 'last_won', p_last_won));

  if p_state is not null then
    insert into public.user_state (user_id, state, client_rev, updated_at) values (v_uid, p_state, 1, now())
      on conflict (user_id) do nothing;   -- bestaande cloud-state (ander toestel) nooit overschrijven
  end if;

  -- welkomstbonus voor bestaande gebruikers: Sparks naar trouw + een gouden kist
  if lt > 0 then
    bonus := least(lt * (c -> 'migration' ->> 'per_won_day')::int, (c -> 'migration' ->> 'max_sparks')::int);
    perform public._gm_add_sparks(v_uid, bonus, 'migration', null, jsonb_build_object('lifetime', lt));
    ev := ev || jsonb_build_object('type', 'sparks', 'amount', bonus, 'why', 'Welkomstbonus');
    ev := ev || public._gm_drop_chest(v_uid, 'goud', 'migratie', t);
  end if;
  return jsonb_build_object('already', false, 'events', ev, 'snapshot', public.gm_snapshot());
end $$;

-- ---------------------------------------------------------------------
-- 5. Row Level Security en rechten
-- ---------------------------------------------------------------------

alter table public.game_config   enable row level security;
alter table public.game_profiles enable row level security;
alter table public.user_state    enable row level security;
alter table public.streak_state  enable row level security;
alter table public.wallets       enable row level security;
alter table public.streak_events enable row level security;
alter table public.reward_events enable row level security;
alter table public.shop_items    enable row level security;
alter table public.inventory     enable row level security;
alter table public.chests        enable row level security;

-- Eigen rijen lezen
drop policy if exists own_read on public.game_profiles;
create policy own_read on public.game_profiles for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.streak_state;
create policy own_read on public.streak_state  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.wallets;
create policy own_read on public.wallets       for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.streak_events;
create policy own_read on public.streak_events for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.reward_events;
create policy own_read on public.reward_events for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.inventory;
create policy own_read on public.inventory     for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.chests;
create policy own_read on public.chests        for select to authenticated using (user_id = (select auth.uid()));

-- App-state: lezen en schrijven van de eigen rij (geen verwijderen vanaf de client)
drop policy if exists own_read on public.user_state;
create policy own_read   on public.user_state for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_insert on public.user_state;
create policy own_insert on public.user_state for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists own_update on public.user_state;
create policy own_update on public.user_state for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Catalogus: publiek leesbaar voor ingelogde gebruikers; game_config blijft privé (geen policy)
drop policy if exists catalog_read on public.shop_items;
create policy catalog_read on public.shop_items for select to authenticated using (active);

-- Tabelrechten: alleen lezen, behalve user_state
revoke all on public.game_config, public.game_profiles, public.streak_state, public.wallets, public.streak_events,
              public.reward_events, public.shop_items, public.inventory, public.chests, public.user_state from anon, authenticated;
grant select on public.game_profiles, public.streak_state, public.wallets, public.streak_events,
               public.reward_events, public.shop_items, public.inventory, public.chests to authenticated;
grant select, insert, update on public.user_state to authenticated;

-- Functierechten: interne helpers voor niemand, RPC's alleen voor ingelogde gebruikers
-- (alleen de functies uit deze migratie; andere functies in het schema blijven ongemoeid)
revoke execute on function
  public._gm_cfg(), public._gm_tier_n(text), public._gm_rank(int), public._gm_freeze_cap(int), public._gm_today(uuid),
  public._gm_repair_cost(int), public._gm_uid(), public._gm_ensure(uuid, text), public._gm_add_sparks(uuid, int, text, text, jsonb),
  public._gm_drop_chest(uuid, text, text, date), public._gm_roll_tier(jsonb, boolean), public._gm_settle(uuid, date),
  public.gm_snapshot(), public.gm_reconcile(text), public.gm_claim_day(date, jsonb), public.gm_open_chest(uuid),
  public.gm_buy(text), public.gm_buy_repair(), public.gm_equip(text, text),
  public.gm_migrate_local(text, jsonb, int, int, int, int, date)
from public, anon, authenticated;
grant execute on function
  public.gm_snapshot(), public.gm_reconcile(text), public.gm_claim_day(date, jsonb), public.gm_open_chest(uuid),
  public.gm_buy(text), public.gm_buy_repair(), public.gm_equip(text, text),
  public.gm_migrate_local(text, jsonb, int, int, int, int, date)
to authenticated;
