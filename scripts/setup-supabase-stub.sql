-- Stubs Supabase-specific objects so the real migration can be applied and
-- verified on a vanilla PostgreSQL instance. Only for local verification —
-- real Supabase projects already provide auth.users, auth.uid(), the
-- authenticated/anon roles, and default grants.
--
-- Usage: run as a superuser BEFORE applying supabase/migrations/*.sql.

do $$ begin
  create role authenticated;
exception when duplicate_object then null; end $$;
do $$ begin
  create role anon;
exception when duplicate_object then null; end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb
);

-- Simulated session user: set `app.uid` per session to act as a user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;

-- Supabase applies default privileges like these so every table created
-- afterwards is automatically accessible to the `authenticated` role.
grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
grant usage on schema public to anon;
grant usage on schema auth to anon;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to anon;
grant execute on function auth.uid() to anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant execute on functions to anon;

do $$ begin
  create publication supabase_realtime;
  -- PG < 15 refuses ALTER ... ADD TABLE on empty publications; add a dummy.
  create table public._realtime_seed (id int);
  alter publication supabase_realtime add table public._realtime_seed;
  drop table public._realtime_seed;
  drop publication supabase_realtime;
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;
