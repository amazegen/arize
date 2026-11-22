-- Disposable LOCAL database rehearsal only. Always rolls back the rehearsal.
\set ON_ERROR_STOP on
begin;
drop function public.founder_dashboard(integer,boolean);
drop function public.founder_dashboard_allowed();
drop function public.founder_record_billing_event(text,text,timestamptz);
drop schema founder_private cascade;
drop table public.founder_subscription_facts,public.founder_billing_receipts,public.founder_reporting_installation,public.founder_admins;
drop index public.founder_checkins_time,public.founder_goals_time,public.founder_village_time,public.founder_coach_time,public.founder_webhooks_time;
do $$ begin
 if to_regclass('public.access_grants') is null or to_regclass('public.billing_webhook_events') is null or to_regprocedure('public.clarity_console_allowed(text)') is null then raise exception 'Rollback touched prior-phase objects';end if;
end $$;
rollback;
\echo 'Founder-only rollback rehearsed and rolled back; prior-phase objects retained.'
