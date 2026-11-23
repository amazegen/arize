-- BRAND NEW disposable local PostgreSQL database only. No hosted connection.
\set ON_ERROR_STOP on
\ir marketing-bootstrap.sql
\ir ../supabase/migrations/20261122202604_browser_push.sql
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now(),not_after timestamptz);
-- Do not let fixtures accidentally hide dependence on broad Auth-table grants.
revoke all on auth.sessions,auth.users from service_role;
create or replace function auth.jwt() returns jsonb language sql stable as $$
 select jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1'),'session_id',current_setting('request.jwt.claim.session_id',true));
$$;
\ir ../supabase/migrations/20261122211346_native_adult_accounts.sql
