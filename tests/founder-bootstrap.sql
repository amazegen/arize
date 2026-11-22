-- A BRAND NEW disposable local PostgreSQL database only. Never a hosted DB.
\set ON_ERROR_STOP on
\ir db-bootstrap.sql
alter table auth.users add column email text;
alter table auth.users add column created_at timestamptz not null default now();
create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,status text);
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true))$$;
grant execute on function auth.jwt() to authenticated;
\ir ../supabase/schema.sql
\ir ../supabase/schema-updates.sql
\ir ../supabase/migrations/20260904202046_add_stripe_billing_access.sql
\ir ../supabase/migrations/20260904202334_harden_security_definer_execution.sql
\ir ../supabase/migrations/20260904204757_backfill_missing_profiles.sql
\ir ../supabase/migrations/20261106220254_mainline_membership_launch.sql
\ir ../supabase/migrations/20261122163011_clarity_configuration_console.sql
grant usage on schema public,auth to authenticated,service_role;
grant select,insert,update,delete on public.profiles,public.goals,public.check_ins,public.village_rooms,public.village_memberships,public.village_messages,public.coach_conversations,public.coach_messages to authenticated;
grant all on all tables in schema public,auth to service_role;
grant usage,select on all sequences in schema public to authenticated,service_role;
\ir ../supabase/migrations/20261122180834_founder_dashboard.sql
