-- LOCAL rollback rehearsal only; never run against hosted data without approval.
begin;
drop function public.browser_push_finish(uuid,uuid,text);
drop function public.browser_push_lease_valid(uuid,uuid);
drop function public.browser_push_claim(integer);
drop function public.browser_push_manage(uuid,text,text,jsonb,text,text);
drop function public.browser_push_eligible(uuid);
drop table public.browser_push_jobs;
drop table public.browser_push_subscriptions;
drop table public.browser_push_preferences;
do $$ begin
 if to_regclass('public.billing_customers') is null or to_regclass('public.clarity_config_versions') is null
 or to_regclass('public.founder_admins') is null or to_regclass('public.marketing_leads') is null
 then raise exception 'Prior app objects lost';end if;
end $$;
rollback;
\echo 'Browser-push-only rollback rehearsed and rolled back; prior features retained.'
