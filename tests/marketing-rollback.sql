-- Rollback rehearsal in a disposable LOCAL database only; always rolled back.
\set ON_ERROR_STOP on
begin;
drop function public.marketing_capture_lead(text,text,text,text),public.marketing_claim_notification(uuid,text),public.marketing_finish_notification(uuid,uuid,text),public.marketing_purge_expired();
drop table public.marketing_leads,public.marketing_rate_limits;
do $$ begin
 if to_regclass('public.access_grants') is null or to_regclass('public.founder_admins') is null or to_regprocedure('public.clarity_console_allowed(text)') is null then raise exception 'Prior phase object removed';end if;
end $$;
rollback;
\echo 'Marketing-only rollback rehearsed and rolled back; earlier phases retained.'
