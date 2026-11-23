\set ON_ERROR_STOP on
-- Disposable local rehearsal; no hosted permission to remove data is implied.
begin;
drop function public.native_claim_turn(uuid,uuid,uuid,uuid,text);
drop function public.native_finish_turn(uuid,uuid,uuid,uuid,text,text,boolean);
drop function public.native_accept_ai_disclosure();
drop function public.native_session_context();
drop function native_private.accept_ai();
drop function native_private.context();
drop function native_private.active_session(uuid,uuid);
drop table native_private.coach_turns;
drop table native_private.ai_consents;
drop schema native_private;
do $$begin if to_regclass('public.goals') is null or to_regclass('public.billing_customers') is null or to_regclass('public.clarity_config_versions') is null or to_regclass('public.browser_push_jobs') is null then raise exception 'Prior objects lost';end if;end $$;
rollback;
\echo 'Native-only rollback rehearsed and rolled back; existing app objects retained.'
