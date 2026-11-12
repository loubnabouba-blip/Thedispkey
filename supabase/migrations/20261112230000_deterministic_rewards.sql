-- =====================================================================
-- Deterministisch beloningssysteem
-- Vervangt de kans-gebaseerde mechanieken uit 20261111120000_gamification.sql:
--   - geen "verrassingskist" meer (toeval/pity-kans per gewonnen dag)
--   - geen jackpot (willekeurige x3 Sparks)
--   - geen gokkans op cosmetica of een beschermer bij het openen van een kist
--   - vaste Sparks per kisttier i.p.v. een willekeurige bandbreedte
-- Een kist blijft alleen vallen bij een duidelijke, uitlegbare reden:
-- je eerste dag, een mijlpaal (7/14/21/30(+30) dagen op rij) of een comeback.
-- De kist-animatie (gm/gamify.js, gmChestModal/gmOpen) blijft ongewijzigd.
-- =====================================================================

-- 1) Config: vaste kistinhoud, geen drop-kans en geen jackpot meer.
update public.game_config set value = (
  (value - 'drop' - 'jackpot')
  || jsonb_build_object(
    'chest', jsonb_build_object(
      'brons',  jsonb_build_object('sparks', 15),
      'zilver', jsonb_build_object('sparks', 35, 'cosmetic', true),
      'goud',   jsonb_build_object('sparks', 75, 'cosmetic', true)
    )
  )
) where key = 'rules';

-- 2) gm_claim_day: alleen nog gegarandeerde kisten (welkom/mijlpaal/comeback).
create or replace function public.gm_claim_day(p_day date, p_pillars jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  c   jsonb := public._gm_cfg();
  t   date;
  st  public.streak_state%rowtype;
  ev  jsonb := '[]'::jsonb;
  score int; perfect boolean; comeback boolean; rk jsonb; rank_n int; cap int;
  sp int; tier text; reason text; ms text;
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

  -- kist: uitsluitend gegarandeerd, met een duidelijke reden. Geen losse kans meer.
  tier := null; reason := null;
  if st.lifetime_won = 1 then tier := 'brons'; reason := 'welkom'; end if;
  if comeback then tier := c -> 'comeback' ->> 'tier'; reason := 'comeback'; st.last_comeback_at := now(); end if;
  ms := c -> 'milestones' ->> st.current::text;
  if ms is null and st.current > 0 and st.current % (c -> 'milestone_every' ->> 'n')::int = 0 then ms := c -> 'milestone_every' ->> 'tier'; end if;
  if ms is not null and (tier is null or public._gm_tier_n(ms) >= public._gm_tier_n(tier)) then tier := ms; reason := 'mijlpaal'; end if;
  if tier is not null then
    ev := ev || public._gm_drop_chest(v_uid, tier, reason, p_day);
  end if;

  if (c -> 'milestones') ? st.current::text or st.current % 30 = 0 then
    ev := ev || jsonb_build_object('type', 'milestone', 'n', st.current);
  end if;

  insert into public.streak_events (user_id, kind, local_day, streak_after, meta)
    values (v_uid, 'day_won', p_day, st.current, jsonb_build_object('score', score, 'perfect', perfect, 'pillars', p_pillars));
  update public.game_profiles set started_day = coalesce(started_day, p_day) where user_id = v_uid;
  update public.streak_state set
    current = st.current, best = st.best, lifetime_won = st.lifetime_won, last_day = st.last_day, freezes = st.freezes,
    broken_streak = st.broken_streak, broken_day = st.broken_day,
    repair_deadline = st.repair_deadline, repair_won = st.repair_won, last_repair_at = st.last_repair_at,
    last_comeback_at = st.last_comeback_at, updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object('already', false, 'events', ev, 'snapshot', public.gm_snapshot());
end $$;

-- 3) gm_open_chest: vaste Sparks per tier, gegarandeerd (niet verloot) cosmetisch
--    item bij zilver/goud als er nog een onbezit item past, anders Sparks erbij.
--    Geen jackpot, geen losse beschermer-kans meer.
create or replace function public.gm_open_chest(p_chest uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._gm_uid();
  c jsonb := public._gm_cfg();
  ch public.chests%rowtype; st public.streak_state%rowtype;
  tc jsonb; sp int; item public.shop_items%rowtype; v_contents jsonb; dup int := 0;
begin
  select * into ch from public.chests where id = p_chest and user_id = v_uid for update;
  if ch.id is null then raise exception 'gm:chest_not_found'; end if;
  if ch.opened_at is not null then
    return jsonb_build_object('contents', ch.contents, 'snapshot', public.gm_snapshot());
  end if;
  select * into st from public.streak_state where user_id = v_uid for update;
  tc := c -> 'chest' -> ch.tier;
  sp := (tc ->> 'sparks')::int;

  -- cosmetisch item: gegarandeerd bij zilver/goud, deterministisch gekozen
  -- (op sortvolgorde, niet verloot), nooit dubbel; zonder passend item: Sparks erbij.
  if coalesce((tc ->> 'cosmetic')::boolean, false) then
    select * into item from public.shop_items s
     where s.active and s.in_chests and s.kind in ('flame', 'orbit', 'theme')
       and public._gm_tier_n(s.rarity) <= public._gm_tier_n(ch.tier)
       and not exists (select 1 from public.inventory i where i.user_id = v_uid and i.item_id = s.id)
     order by s.sort limit 1;
    if item.id is not null then
      insert into public.inventory (user_id, item_id, source) values (v_uid, item.id, 'chest');
      insert into public.reward_events (user_id, kind, source, ref_id, meta) values (v_uid, 'item_granted', 'chest', item.id, jsonb_build_object('chest', ch.id));
    else
      dup := (c ->> 'duplicate_sparks')::int;  -- alles al in bezit: omzetten in Sparks
    end if;
  end if;

  perform public._gm_add_sparks(v_uid, sp + dup, 'chest', ch.id::text, jsonb_build_object('tier', ch.tier));

  v_contents := jsonb_build_object('tier', ch.tier, 'sparks', sp + dup, 'jackpot', false, 'freeze', false,
    'item', case when item.id is not null then jsonb_build_object('id', item.id, 'kind', item.kind, 'name', item.name, 'rarity', item.rarity, 'style', item.style) else null end);
  update public.chests set opened_at = now(), contents = v_contents where id = ch.id;
  insert into public.reward_events (user_id, kind, source, ref_id, meta) values (v_uid, 'chest_opened', ch.reason, ch.id::text, v_contents);
  return jsonb_build_object('contents', v_contents, 'snapshot', public.gm_snapshot());
end $$;

-- 4) De kans-rolfunctie is niet langer in gebruik.
drop function if exists public._gm_roll_tier(jsonb, boolean);

-- Rechten blijven ongewijzigd (zelfde functienamen/handtekeningen als voorheen).
