-- Testscript voor 20261111130000_auth_profiles.sql: profielen en verplichte e-mailverificatie.
\set ON_ERROR_STOP 1
\set N '00000000-0000-0000-0000-0000000000f1'
\set O '00000000-0000-0000-0000-0000000000f2'

delete from auth.users where id in (:'N', :'O');
drop schema if exists gm_test cascade;
create schema gm_test;
create or replace function gm_test.ok(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;
grant usage on schema gm_test to authenticated, anon;
grant execute on function gm_test.ok(boolean, text) to authenticated, anon;

-- Registratie: Supabase maakt de auth.users-rij aan (nog niet bevestigd), de trigger het profiel
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (:'N', 'nieuw@voorbeeld.nl', null, '{"name":"  Sam  "}'),
       (:'O', 'ander@voorbeeld.nl', now(), '{}');
select gm_test.ok((select display_name from public.profiles where id = :'N') = 'Sam', 'profiel automatisch aangemaakt met naam uit registratie');
select gm_test.ok((select onboarding_status from public.profiles where id = :'N') = 'nieuw', 'onboarding-status start op nieuw');
select gm_test.ok((select display_name from public.profiles where id = :'O') is null, 'zonder naam: display_name leeg');

-- Onbevestigd account: geen beloningen, geen sync, geen migratie
set request.jwt.claim.sub = :'N';
set role authenticated;
do $$ begin
  perform gm_test.ok(not public.gm_email_verified(), 'onbevestigd account herkend');
  begin perform public.gm_reconcile('Europe/Amsterdam'); perform gm_test.ok(false, 'reconcile moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:email_unverified', 'geen gamificatie zonder bevestigd e-mailadres'); end;
  begin perform public.gm_migrate_local('Europe/Amsterdam', '{}', 5, 5, 5, 0, current_date); perform gm_test.ok(false, 'migratie moet falen');
  exception when others then perform gm_test.ok(sqlerrm = 'gm:email_unverified', 'geen migratie zonder bevestigd e-mailadres'); end;
  begin insert into public.user_state (user_id, state) values (auth.uid(), '{}'); perform gm_test.ok(false, 'sync moet falen');
  exception when others then perform gm_test.ok(sqlstate = '42501', 'geen cloud-sync zonder bevestigd e-mailadres'); end;
  -- eigen profiel lezen mag wel (om de naam te tonen tijdens verificatie)
  perform gm_test.ok((select count(*) from public.profiles) = 1, 'onbevestigd: alleen eigen profiel zichtbaar');
end $$;

-- Bevestigen (klik op de link of code uit de mail)
reset role;
update auth.users set email_confirmed_at = now() where id = :'N';
set role authenticated;
do $$ declare r jsonb; begin
  perform gm_test.ok(public.gm_email_verified(), 'bevestigd account herkend');
  r := public.gm_migrate_local('Europe/Amsterdam', '{"v":1}', 4, 9, 20, 1, current_date);
  perform gm_test.ok((r -> 'snapshot' -> 'streak' ->> 'current')::int = 4, 'na bevestiging: lokale data gemigreerd naar de user_id');
  perform gm_test.ok((select count(*) from public.user_state) = 1, 'na bevestiging: cloud-sync werkt');

  -- profiel bijwerken: alleen toegestane kolommen, alleen eigen rij
  update public.profiles set display_name = 'Sam B', onboarding_status = 'klaar' where id = auth.uid();
  perform gm_test.ok((select display_name || '/' || onboarding_status from public.profiles where id = auth.uid()) = 'Sam B/klaar', 'eigen naam en onboarding-status aanpasbaar');
  update public.profiles set display_name = 'Gehackt' where id = '00000000-0000-0000-0000-0000000000f2';
  perform gm_test.ok(true, 'update op andermans profiel raakt 0 rijen (RLS)');
  begin update public.profiles set id = gen_random_uuid() where id = auth.uid(); perform gm_test.ok(false, 'id wijzigen moet falen');
  exception when insufficient_privilege then perform gm_test.ok(true, 'id en created_at niet aanpasbaar'); end;
  begin update public.profiles set onboarding_status = 'vip' where id = auth.uid(); perform gm_test.ok(false, 'ongeldige status moet falen');
  exception when check_violation then perform gm_test.ok(true, 'onboarding-status beperkt tot nieuw/bezig/klaar'); end;
  begin update public.profiles set avatar_url = 'javascript:alert(1)' where id = auth.uid(); perform gm_test.ok(false, 'onveilige avatar-url moet falen');
  exception when check_violation then perform gm_test.ok(true, 'avatar alleen via https'); end;
  begin delete from public.profiles where id = auth.uid(); perform gm_test.ok(false, 'profiel verwijderen moet falen');
  exception when insufficient_privilege then perform gm_test.ok(true, 'profiel niet te verwijderen door client'); end;
end $$;
reset role;
select gm_test.ok((select display_name from public.profiles where id = :'O') is null, 'andermans profiel ongewijzigd');

-- Anoniem: geen profielen
set role anon;
do $$ begin
  begin perform count(*) from public.profiles; perform gm_test.ok(false, 'anon moet geweigerd worden');
  exception when insufficient_privilege then perform gm_test.ok(true, 'anon ziet geen profielen'); end;
end $$;
reset role;

-- Account verwijderen ruimt profiel op
delete from auth.users where id in (:'N', :'O');
select gm_test.ok((select count(*) from public.profiles where id in (:'N', :'O')) = 0, 'profiel verdwijnt met het account');
drop schema gm_test cascade;
select 'ALL_AUTH_TESTS_PASSED';
