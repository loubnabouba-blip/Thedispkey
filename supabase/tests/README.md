# Tests voor de gamificatie-migratie

De tests draaien tegen een lokale Postgres (16+) met een minimale nabootsing van Supabase (`auth.users`, `auth.uid()`, de rollen `anon` en `authenticated`).

```bash
# 1. Lokale Postgres starten (of gebruik `supabase start` en sla stap 2 over)
initdb -D /tmp/dk-pg -A trust -U postgres && pg_ctl -D /tmp/dk-pg -o "-p 5499" start
P="psql -h localhost -p 5499 -U postgres -q"

# 2. Auth-stub
$P <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');
SQL

# 3. Migratie (twee keer: moet idempotent zijn) en tests
$P -f supabase/migrations/20261111120000_gamification.sql
$P -f supabase/migrations/20261111120000_gamification.sql
$P -f supabase/tests/gamification_test.sql      # eindigt met ALL_TESTS_PASSED
$P -f supabase/tests/economy_sim.sql            # 365 dagen economie, print kerncijfers
```

`gamification_test.sql` dekt 60+ checks:
- **Claims:** idempotent claimen, claimen buiten het tijdvenster (klokmanipulatie) en een te lage score.
- **Streak:** beschermers, breuk en herstel-quest, gekocht herstel, en het afhandelen van dagen bij het openen van de app.
- **Winkel:** caps, rang, alleen-uit-kisten, dubbele items en slots.
- **Kisten:** kisten openen is idempotent.
- **Toegang:** RLS-isolatie tussen gebruikers en anon geweigerd.
- **Migratie:** eenmalige migratie met begrenzing, en een verouderde lokale reeks.
