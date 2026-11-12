-- Testscript voor 20261111120000_gamification.sql
-- Draait tegen een lokale Postgres met een minimale auth-stub (zie supabase/tests/README.md).
-- Elke check gooit een fout als hij faalt; de laatste regel print ALL_TESTS_PASSED.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

-- schone start voor de testgebruikers
do $$ declare u uuid[] := array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d']::uuid[]; begin
  delete from public.streak_events where user_id = any(u); delete from public.reward_events where user_id = any(u);
  delete from public.chests where user_id = any(u); delete from public.inventory where user_id = any(u);
  delete from public.user_state where user_id = any(u); delete from public.wallets where user_id = any(u);
  delete from public.streak_state where user_id = any(u); delete from public.game_profiles where user_id = any(u);
end $$;
drop schema if exists gm_test cascade;
create schema if not exists gm_test;
create or replace function gm_test.ok(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;
-- de rol "authenticated" moet de assert-helper kunnen aanroepen
grant usage on schema gm_test to authenticated, anon;
grant execute on function gm_test.ok(boolean, text) to authenticated, anon;

-- ===== Gebruiker A: eerste dag, claimen, anti-cheat =====
set request.jwt.claim.sub = :'A';
set role authenticated;
select gm_test.ok((public.gm_reconcile('Europe/Amsterdam') -> 'snapshot' -> 'streak' ->> 'current')::int = 0, 'reconcile maakt profiel aan met streak 0');

do $$ declare r jsonb; t date := (now() at time zone 'Europe/Amsterdam')::date; begin
  r := public.gm_claim_day(t, '{"train":true,"steps":true,"protein":true,"check":false}');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 1, 'eerste claim: streak 1');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'freezes')::int = 1, 'eerste claim: startbeschermer');
  perform gm_test.ok(exists (select 1 from jsonb_array_elements(r -> 'events') e where e ->> 'type' = 'chest' and e ->> 'reason' = 'welkom'), 'eerste claim: welkomstkist');
  perform gm_test.ok((r -> 'snapshot' ->> 'sparks')::int = 8, 'eerste claim: 8 Sparks');
  r := public.gm_claim_day(t, '{"train":true,"steps":true,"protein":true,"check":true}');
  perform gm_test.ok((r ->> 'already')::boolean, 'dubbele claim is idempotent');
  perform gm_test.ok((r -> 'snapshot' ->> 'sparks')::int = 8, 'dubbele claim geeft geen extra Sparks');
end $$;

do $$ declare t date := (now() at time zone 'Europe/Amsterdam')::date; begin
  begin perform public.gm_claim_day(t + 1, '{"train":true,"steps":true,"protein":true}'); perform gm_test.ok(false, 'morgen claimen moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:day_out_of_window', 'morgen claimen geweigerd (klok verzetten helpt niet)'); end;
  begin perform public.gm_claim_day(t - 5, '{"train":true,"steps":true,"protein":true}'); perform gm_test.ok(false, 'oude dag claimen moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:day_out_of_window', 'dag van 5 dagen terug geweigerd'); end;
  begin perform public.gm_claim_day(t, '{"train":true,"steps":true}'); perform gm_test.ok(false, '2/4 claimen moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:not_won', '2 van 4 dagdoelen is geen gewonnen dag'); end;
end $$;

-- Directe schrijfacties op spel-tabellen zijn verboden
do $$ begin
  begin update public.wallets set sparks = 99999; perform gm_test.ok(false, 'wallet updaten moet falen');
  exception when insufficient_privilege then perform gm_test.ok(true, 'client kan wallet niet zelf ophogen'); end;
  begin insert into public.chests (user_id, tier, reason) values (auth.uid(), 'goud', 'hack'); perform gm_test.ok(false, 'kist invoegen moet falen');
  exception when insufficient_privilege then perform gm_test.ok(true, 'client kan geen kisten aanmaken'); end;
  begin perform public._gm_add_sparks(auth.uid(), 1000, 'hack', null, null); perform gm_test.ok(false, 'interne helper moet afgeschermd zijn');
  exception when insufficient_privilege then perform gm_test.ok(true, 'interne helpers niet aanroepbaar'); end;
end $$;

-- ===== Breuk, beschermers en herstel-quest (dagen simuleren als superuser) =====
reset role;
update public.streak_state set current = 10, best = 10, lifetime_won = 10, freezes = 1,
  last_day = (now() at time zone 'Europe/Amsterdam')::date - 3 where user_id = :'A';
delete from public.streak_events where user_id = :'A' and kind = 'day_won';
set role authenticated;
do $$ declare r jsonb; t date := (now() at time zone 'Europe/Amsterdam')::date; begin
  -- 2 gemiste dagen, 1 beschermer: beschermer blijft bewaard, reeks breekt, herstel mogelijk
  r := public.gm_claim_day(t, '{"rest":true,"steps":true,"protein":true}');
  perform gm_test.ok(exists (select 1 from jsonb_array_elements(r -> 'events') e where e ->> 'type' = 'streak_broken' and (e ->> 'lost')::int = 10), 'reeks van 10 breekt bij 2 gemiste dagen');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'freezes')::int = 1, 'beschermer niet verspild aan een reeks die toch breekt');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 1, 'nieuwe reeks start op 1');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' -> 'repair' ->> 'won')::int = 1, 'herstel-quest: 1 van 2');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' -> 'repair' ->> 'cost')::int = 100, 'herstelprijs 40 + 6*10 = 100');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'lifetime_won')::int = 11, 'totaal gewonnen dagen telt door');
  perform gm_test.ok(exists (select 1 from jsonb_array_elements(r -> 'events') e where e ->> 'reason' = 'comeback'), 'comeback-kist na breuk');
end $$;

reset role;
-- volgende dag simuleren: de claim van vandaag wordt gisteren
update public.streak_events set local_day = local_day - 1 where user_id = :'A' and kind = 'day_won';
update public.streak_state set last_day = last_day - 1 where user_id = :'A';
set role authenticated;
do $$ declare r jsonb; t date := (now() at time zone 'Europe/Amsterdam')::date; begin
  r := public.gm_claim_day(t, '{"train":true,"steps":true,"protein":true,"check":true}');
  perform gm_test.ok(exists (select 1 from jsonb_array_elements(r -> 'events') e where e ->> 'type' = 'repair_completed'), 'herstel-quest voltooid');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 12, 'reeks hersteld: 10 + 2 = 12');
  perform gm_test.ok(r -> 'snapshot' -> 'streak' -> 'repair' = 'null'::jsonb, 'geen open herstel meer');
end $$;

-- 1 gemiste dag met 1 beschermer: beschermer vangt op
reset role;
update public.streak_events set local_day = local_day - 2 where user_id = :'A' and kind = 'day_won';
update public.streak_state set last_day = last_day - 2 where user_id = :'A';
set role authenticated;
do $$ declare r jsonb; t date := (now() at time zone 'Europe/Amsterdam')::date; begin
  r := public.gm_claim_day(t, '{"train":true,"steps":true,"protein":true}');
  perform gm_test.ok(exists (select 1 from jsonb_array_elements(r -> 'events') e where e ->> 'type' = 'freeze_used'), 'beschermer gebruikt voor 1 gemiste dag');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 13, 'reeks loopt door naar 13');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'freezes')::int = 0, 'beschermer verbruikt');
end $$;

-- reconcile handelt definitieve dagen af zonder claim (t/m eergisteren)
reset role;
update public.streak_state set last_day = (now() at time zone 'Europe/Amsterdam')::date - 5 where user_id = :'A';
update public.streak_state set last_repair_at = null where user_id = :'A';
set role authenticated;
do $$ declare r jsonb; begin
  r := public.gm_reconcile(null);
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 0, 'reconcile breekt reeks na 3 definitieve gemiste dagen');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' -> 'repair' ->> 'lost')::int = 13, 'reconcile opent herstelvenster voor 13');
end $$;

-- Herstel kopen
do $$ declare r jsonb; begin
  begin perform public.gm_buy_repair(); perform gm_test.ok(false, 'herstel zonder Sparks moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:insufficient_sparks', 'herstel kopen zonder genoeg Sparks geweigerd'); end;
end $$;
reset role; update public.wallets set sparks = 1000 where user_id = :'A'; set role authenticated;
do $$ declare r jsonb; begin
  r := public.gm_buy_repair();
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 13, 'gekocht herstel zet 13 terug');
  perform gm_test.ok((r -> 'snapshot' ->> 'sparks')::int = 1000 - (40 + 6 * 13), 'herstelprijs afgeschreven');
end $$;

-- Winkel: beschermer, cap, cosmetisch, equip
do $$ declare r jsonb; begin
  r := public.gm_buy('freeze'); r := public.gm_buy('freeze');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'freezes')::int = 2, 'twee beschermers gekocht');
  begin perform public.gm_buy('freeze'); perform gm_test.ok(false, 'boven cap kopen moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:freezes_full', 'beschermer-cap (2) bewaakt'); end;
  begin perform public.gm_buy('flame_goud'); perform gm_test.ok(false, 'rang te laag moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:rank_too_low', 'gouden vlam vergrendeld onder rang 3'); end;
  begin perform public.gm_buy('flame_regenboog'); perform gm_test.ok(false, 'kist-only item kopen moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:not_for_sale', 'kist-only item niet te koop'); end;
  begin perform public.gm_equip('flame', 'flame_ijs'); perform gm_test.ok(false, 'niet-bezeten item aanzetten moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:not_owned', 'kan geen item aanzetten dat je niet hebt'); end;
  r := public.gm_buy('flame_ijs');
  begin perform public.gm_buy('flame_ijs'); perform gm_test.ok(false, 'dubbel kopen moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:already_owned', 'item niet dubbel te kopen'); end;
  r := public.gm_equip('flame', 'flame_ijs');
  perform gm_test.ok(r -> 'snapshot' -> 'equipped' ->> 'flame' = 'flame_ijs', 'IJsvlam aangezet');
  begin perform public.gm_equip('orbit', 'flame_ijs'); perform gm_test.ok(false, 'verkeerd slot moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:bad_slot', 'vlam past niet in orbit-slot'); end;
end $$;

-- Kisten openen: inhoud pas bij openen, idempotent
do $$ declare r jsonb; r2 jsonb; ch uuid; n int := 0; begin
  for ch in select (x ->> 'id')::uuid from jsonb_array_elements(public.gm_snapshot() -> 'chests') x loop
    r := public.gm_open_chest(ch); n := n + 1;
    perform gm_test.ok((r -> 'contents' ->> 'sparks')::int > 0, 'kist geeft Sparks (' || (r -> 'contents' ->> 'tier') || ')');
    r2 := public.gm_open_chest(ch);
    perform gm_test.ok(r2 -> 'contents' = r -> 'contents', 'kist opnieuw openen geeft dezelfde inhoud');
  end loop;
  perform gm_test.ok(n >= 2, 'minstens welkomst- en comeback-kist geopend');
  perform gm_test.ok(jsonb_array_length(public.gm_snapshot() -> 'chests') = 0, 'geen ongeopende kisten meer');
end $$;

-- ===== RLS: gebruiker B ziet niets van A =====
reset role;
set request.jwt.claim.sub = :'B';
set role authenticated;
do $$ begin
  perform public.gm_reconcile('Europe/Amsterdam');
  perform gm_test.ok((select count(*) from public.wallets) = 1, 'B ziet alleen eigen wallet');
  perform gm_test.ok((select count(*) from public.streak_events where user_id <> auth.uid()) = 0, 'B ziet geen streak_events van A');
  perform gm_test.ok((select count(*) from public.chests where user_id <> auth.uid()) = 0, 'B ziet geen kisten van A');
  begin perform count(*) from public.game_config; perform gm_test.ok(false, 'game_config lezen moet falen');
  exception when insufficient_privilege then perform gm_test.ok(true, 'game_config (kansen/tuning) niet leesbaar voor clients'); end;
  perform gm_test.ok((select count(*) from public.shop_items) > 5, 'catalogus wel leesbaar');
  insert into public.user_state (user_id, state) values (auth.uid(), '{"v":1}');
  perform gm_test.ok((select count(*) from public.user_state) = 1, 'B kan eigen state opslaan');
  begin insert into public.user_state (user_id, state) values ('00000000-0000-0000-0000-00000000000a', '{}'); perform gm_test.ok(false, 'state van ander invoegen moet falen');
  exception when others then perform gm_test.ok(sqlstate = '42501', 'B kan geen state voor A schrijven'); end;
  begin perform public.gm_open_chest((select id from public.chests limit 1)); exception when others then null; end;
end $$;
-- B kan een kist van A niet openen
reset role;
create temp table a_chest as select public._gm_drop_chest(:'A', 'goud', 'test', null) ->> 'id' as id;
grant select on a_chest to authenticated;
set role authenticated;
do $$ begin
  begin perform public.gm_open_chest((select id::uuid from a_chest)); perform gm_test.ok(false, 'kist van ander openen moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:chest_not_found', 'B kan kist van A niet openen'); end;
end $$;

-- ===== Anoniem: geen toegang =====
reset role;
set request.jwt.claim.sub = '';
set role anon;
do $$ begin
  begin perform public.gm_snapshot(); perform gm_test.ok(false, 'anon moet geweigerd worden');
  exception when insufficient_privilege then perform gm_test.ok(true, 'anon kan geen RPC aanroepen'); end;
end $$;

-- ===== Migratie van localStorage (gebruiker C) =====
reset role;
set request.jwt.claim.sub = :'C';
set role authenticated;
do $$ declare r jsonb; t date := (now() at time zone 'Europe/Amsterdam')::date; begin
  r := public.gm_migrate_local('Europe/Amsterdam', '{"v":1,"logs":[]}', 25, 40, 90, 5, t - 1);
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 25, 'migratie neemt reeks van 25 over');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'freezes')::int = 3, 'beschermers begrensd op cap (rang 3: 3)');
  perform gm_test.ok((r -> 'snapshot' ->> 'sparks')::int = 180, 'welkomstbonus 90*2 = 180');
  perform gm_test.ok(exists (select 1 from jsonb_array_elements(r -> 'events') e where e ->> 'reason' = 'migratie' and e ->> 'tier' = 'goud'), 'gouden migratiekist');
  perform gm_test.ok((select count(*) from public.user_state) = 1, 'lokale state opgeslagen in user_state');
  r := public.gm_migrate_local('Europe/Amsterdam', '{}', 999, 999, 999, 9, t);
  perform gm_test.ok((r ->> 'already')::boolean and (r -> 'snapshot' -> 'streak' ->> 'current')::int = 25, 'migratie werkt maar één keer');
  -- verder bouwen op de gemigreerde reeks: vandaag claimen -> 26
  r := public.gm_claim_day(t, '{"train":true,"steps":true,"protein":true}');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 26, 'claim na migratie: 26');
end $$;

-- Gebruiker D: verouderde lokale reeks telt niet
reset role;
set request.jwt.claim.sub = :'D';
set role authenticated;
do $$ declare r jsonb; t date := (now() at time zone 'Europe/Amsterdam')::date; begin
  r := public.gm_migrate_local('Europe/Amsterdam', null, 30, 30, 30, 2, t - 4);
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 0, 'oude lokale reeks (4 dagen terug) wordt niet overgenomen');
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'best')::int = 30, 'beste reeks blijft wel bewaard');
  begin perform public.gm_reconcile('Mars/Olympus'); perform gm_test.ok(false, 'ongeldige tijdzone moet falen');
  exception when others then perform gm_test.ok(sqlstate = '22023', 'ongeldige tijdzone geweigerd'); end;
end $$;

reset role;
drop schema gm_test cascade;
select 'ALL_TESTS_PASSED';
