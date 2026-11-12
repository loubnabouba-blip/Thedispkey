-- Economie-simulatie: 365 dagen voor één testgebruiker, met realistisch gedrag
-- (ca. 80% van de dagen gewonnen, 30% daarvan perfect). Opent elke kist direct.
-- Gebruik: na de migratie en de auth-stub draaien; print kerncijfers per kwartaal.
\set ON_ERROR_STOP 1
\set U '00000000-0000-0000-0000-00000000000d'
delete from public.streak_events where user_id = :'U'; delete from public.reward_events where user_id = :'U';
delete from public.chests where user_id = :'U'; delete from public.inventory where user_id = :'U';
delete from public.wallets where user_id = :'U'; delete from public.streak_state where user_id = :'U'; delete from public.game_profiles where user_id = :'U';
create temp table sim (day int, won boolean, chests int, sparks int, current int, freezes int, items int);
grant all on sim to authenticated;
set request.jwt.claim.sub = :'U';
do $$
declare i int; t date; r jsonb; ch jsonb; won boolean; perfect boolean; nch int; uid uuid := auth.uid();
begin
  perform setseed(0.42);
  perform public.gm_reconcile('Europe/Amsterdam');
  for i in 1..365 loop
    t := (now() at time zone 'Europe/Amsterdam')::date;
    -- "nieuwe dag": schuif alle bestaande dagen één dag terug
    -- in twee stappen, anders botst de unieke index (één winst per dag) halverwege
    update public.streak_events set local_day = local_day + 100000 where user_id = uid and local_day is not null;
    update public.streak_events set local_day = local_day - 100001 where user_id = uid and local_day is not null;
    update public.streak_state set last_day = last_day - 1, repair_deadline = repair_deadline - interval '1 day',
           last_repair_at = last_repair_at - interval '1 day', last_comeback_at = last_comeback_at - interval '1 day' where user_id = uid;
    update public.game_profiles set started_day = started_day - 1 where user_id = uid;
    perform public.gm_reconcile(null);
    won := random() < 0.80; perfect := random() < 0.30; nch := 0;
    if won then
      r := public.gm_claim_day(t, jsonb_build_object('train', true, 'steps', true, 'protein', true, 'check', perfect));
      for ch in select x from jsonb_array_elements(r -> 'snapshot' -> 'chests') x loop
        perform public.gm_open_chest((ch ->> 'id')::uuid); nch := nch + 1;
      end loop;
    end if;
    r := public.gm_snapshot();
    insert into sim values (i, won, nch, (r ->> 'sparks')::int, (r -> 'streak' ->> 'current')::int, (r -> 'streak' ->> 'freezes')::int, jsonb_array_length(r -> 'inventory'));
  end loop;
end $$;
select (day - 1) / 91 + 1 as kwartaal, count(*) filter (where won) as dagen_gewonnen, sum(chests) as kisten,
       round(sum(chests)::numeric / nullif(count(*) filter (where won), 0) * 7, 1) as kisten_per_7_gewonnen,
       max(sparks) as sparks_eind, max(current) as max_reeks, max(items) as items
from sim group by 1 order by 1;
select round((max(r.lifetime_sparks))::numeric / 365, 1) as sparks_per_dag,
       (select count(*) from public.streak_events where user_id = auth.uid() and kind = 'freeze_used') as beschermers_gebruikt,
       (select count(*) from public.streak_events where user_id = auth.uid() and kind = 'streak_broken') as breuken,
       (select count(*) from public.streak_events where user_id = auth.uid() and kind = 'repair_completed') as herstel_quests,
       (select jsonb_object_agg(tier, n) from (select tier, count(*) n from public.chests where user_id = auth.uid() group by tier) x) as tiers,
       (select jsonb_object_agg(reason, n) from (select reason, count(*) n from public.chests where user_id = auth.uid() group by reason) x) as redenen
from public.wallets r where r.user_id = auth.uid();
