-- BRAND NEW isolated local Supabase services only, never a hosted database.
\set ON_ERROR_STOP on
do $$begin
 if to_regclass('public.profiles') is not null or exists(select 1 from auth.users)
 then raise exception 'Requires a fresh disposable local Supabase stack';end if;
end $$;
\ir ../supabase/schema.sql
\ir ../supabase/schema-updates.sql
\ir ../supabase/migrations/20260904202046_add_stripe_billing_access.sql
\ir ../supabase/migrations/20260904202334_harden_security_definer_execution.sql
\ir ../supabase/migrations/20260904204757_backfill_missing_profiles.sql
\ir ../supabase/migrations/20261106220254_mainline_membership_launch.sql
\ir ../supabase/migrations/20261122163011_clarity_configuration_console.sql
\ir ../supabase/migrations/20261122180834_founder_dashboard.sql
\ir ../supabase/migrations/20261122191439_marketing_leads.sql
\ir ../supabase/migrations/20261122202604_browser_push.sql
\ir ../supabase/migrations/20261122211346_native_adult_accounts.sql
\echo 'Adult schema installed on disposable local Supabase; no Auth schema mocks or broad fixture grants.'
