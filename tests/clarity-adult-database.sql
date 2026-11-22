-- Fresh disposable LOCAL PostgreSQL only. No hosted credentials.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text);
create table auth.mfa_factors(id uuid primary key,user_id uuid,status text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true))$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid(),auth.jwt() to authenticated;
\ir ../supabase/migrations/20261122163011_clarity_configuration_console.sql
\ir clarity-database.sql
rollback;
\echo 'Adult Clarity database fixture rolled back.'
