\set ON_ERROR_STOP on
begin;
-- Fictional identities only. Every fixture is rolled back.
insert into auth.users(id,email,created_at) values
 ('d1000000-0000-4000-8000-000000000001','founder@example.test',now()-interval '90 days'),
 ('d1000000-0000-4000-8000-000000000002','adult-one@example.test',now()-interval '1 day'),
 ('d1000000-0000-4000-8000-000000000003','adult-two@example.test',now()-interval '2 days'),
 ('d1000000-0000-4000-8000-000000000004','config-only@example.test',now()-interval '1 day'),
 ('d1000000-0000-4000-8000-000000000005','pending-delete@example.test',now()-interval '1 day');
insert into public.founder_admins(user_id) values('d1000000-0000-4000-8000-000000000001');
insert into public.clarity_admins(user_id) values('d1000000-0000-4000-8000-000000000004');
insert into public.account_deletion_jobs(user_id) values('d1000000-0000-4000-8000-000000000005');
update public.founder_reporting_installation set capture_started_at=now()-interval '90 days';
insert into public.check_ins(user_id,mood,mood_score,energy,journal_text,created_at) values
 ('d1000000-0000-4000-8000-000000000002','steady',3,5,'NEVER_RETURN_PRIVATE_JOURNAL',now()-interval '1 hour'),
 ('d1000000-0000-4000-8000-000000000002','steady',3,5,'NEVER_RETURN_PRIVATE_JOURNAL',now()-interval '2 hours'),
 ('d1000000-0000-4000-8000-000000000003','steady',3,5,'NEVER_RETURN_PRIVATE_JOURNAL',now()-interval '8 days'),
 ('d1000000-0000-4000-8000-000000000001','steady',3,5,'ADMIN_EXCLUDED',now()-interval '1 hour'),
 ('d1000000-0000-4000-8000-000000000005','steady',3,5,'DELETING_EXCLUDED',now()-interval '1 hour');
insert into public.coach_conversations(id,user_id,title) values
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','NEVER_RETURN_CHAT_TITLE'),
 ('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003','EMPTY_CONVERSATION');
insert into public.coach_messages(conversation_id,user_id,role,content,created_at) values
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','user','NEVER_RETURN_CHAT_TEXT',now()-interval '3 hours'),
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','user','NEVER_RETURN_CHAT_TEXT',now()-interval '2 hours'),
 ('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003','assistant','NO_USER_TURN',now()-interval '1 hour');
insert into public.billing_customers(user_id,stripe_customer_id) values
 ('d1000000-0000-4000-8000-000000000002','cus_founder_one'),('d1000000-0000-4000-8000-000000000003','cus_founder_two');
insert into public.access_grants(user_id,plan,source,status,starts_at,ends_at,external_reference,metadata)
select u,'plus',src,'active',now()-interval '2 days',now()+interval '20 days',sub,
 jsonb_build_object('provider','stripe','stripe_status',st,'livemode',live,'stripe_customer_id',cust,'billing_period',period,'cancel_at_period_end',cancel,'payment_grace',grace,'trial_started_at',now()-interval '30 days','trial_ends_at',now()-interval '15 days')
from (values
 ('d1000000-0000-4000-8000-000000000002'::uuid,'subscription','sub_founder_monthly','active',false,'cus_founder_one','monthly',true,false),
 ('d1000000-0000-4000-8000-000000000003'::uuid,'subscription','sub_founder_annual','active',false,'cus_founder_two','annual',false,false),
 ('d1000000-0000-4000-8000-000000000002'::uuid,'subscription','sub_founder_live','active',true,'cus_founder_one','monthly',false,false),
 ('d1000000-0000-4000-8000-000000000002'::uuid,'checkout_trial','sub_founder_trial','trialing',false,'cus_founder_one','annual',false,false),
 ('d1000000-0000-4000-8000-000000000002'::uuid,'subscription','sub_founder_grace','past_due',false,'cus_founder_one','monthly',false,true)
)v(u,src,sub,st,live,cust,period,cancel,grace);
insert into public.access_grants(user_id,plan,source,status,starts_at,ends_at) values
 ('d1000000-0000-4000-8000-000000000003','plus','early_member_trial','active',now()-interval '1 day',now()+interval '1 day');

set local role authenticated;
set local request.jwt.claim.sub='d1000000-0000-4000-8000-000000000002';
do $$ begin
 if public.founder_dashboard_allowed() then raise exception 'Ordinary user became founder';end if;
 begin perform public.founder_dashboard();raise exception 'Ordinary aggregate access';exception when insufficient_privilege then null;end;
 begin insert into public.founder_admins(user_id) values(auth.uid());raise exception 'Self-grant';exception when insufficient_privilege then null;end;
 begin select * from public.founder_subscription_facts;raise exception 'Raw facts exposed';exception when insufficient_privilege then null;end;
 begin perform public.founder_record_billing_event('evt_fake',null,null);raise exception 'Browser minted paid fact';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claim.sub='d1000000-0000-4000-8000-000000000004';
do $$ begin if public.founder_dashboard_allowed() then raise exception 'Clarity editor became founder';end if;end $$;
set local request.jwt.claim.sub='d1000000-0000-4000-8000-000000000001';
do $$ declare r jsonb;begin
 if not public.founder_dashboard_allowed() then raise exception 'Founder denied';end if;
 r:=public.founder_dashboard(7,false);
 if (r->>'registrations')::integer<>2 or (r->>'registeredAccounts')::integer<>2 then raise exception 'Registration grain/admin/deletion exclusion %',r;end if;
 if (r->>'weeklyActiveUsers')::integer<>1 or (r->>'checkIns')::integer<>2 or (r->>'claritySessions')::integer<>1 then raise exception 'Activity duplicate/empty-conversation counts %',r;end if;
 if r->'billing'<>jsonb_build_object('monthly',1,'annual',1,'stripeTrials',1,'complimentaryTrials',1,'unclassified',0) then raise exception 'Billing mode/grace/trial split %',r;end if;
 if jsonb_array_length(r->'trend')<>7 then raise exception 'Missing zero days';end if;
 if (public.founder_dashboard(30,false)->>'checkIns')::integer<>3 then raise exception '30-day range not applied';end if;
 if public.founder_dashboard(30,true)->'billing'->>'monthly'<>'1' then raise exception 'Live/test separation';end if;
 if r::text~'NEVER_RETURN|@example|cus_|sub_|d1000000|journal_text|mood_score|content' then raise exception 'Private data in report';end if;
 begin perform public.founder_dashboard(1000,false);raise exception 'Unbounded range accepted';exception when invalid_parameter_value then null;end;
 begin perform public.founder_dashboard(null,false);raise exception 'Null range accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
-- Unclassified legacy billing records are reported, not guessed into a price.
insert into public.access_grants(user_id,plan,source,status,starts_at,ends_at,external_reference,metadata) values
 ('d1000000-0000-4000-8000-000000000002','plus','subscription','active',now()-interval '1 day',now()+interval '1 day','sub_founder_unknown','{"livemode":false}');
set local role authenticated;
do $$ begin if public.founder_dashboard(7,false)->'billing'->>'unclassified'<>'1' then raise exception 'Missing billing classification hidden';end if;end $$;
reset role;
delete from public.access_grants where external_reference='sub_founder_unknown';
insert into auth.mfa_factors(user_id,status) values('d1000000-0000-4000-8000-000000000001','verified');
set local role authenticated;
set local request.jwt.claim.aal='aal1';
do $$ begin if public.founder_dashboard_allowed() then raise exception 'MFA bypass';end if;end $$;
set local request.jwt.claim.aal='aal2';
do $$ begin if not public.founder_dashboard_allowed() then raise exception 'MFA completion rejected';end if;end $$;
reset role;

insert into public.billing_webhook_events(event_id,event_type,livemode,status,processed_at) values
 ('evt_founder_paid','invoice.paid',false,'processed',now()),('evt_founder_replay','invoice.paid',false,'processed',now()),
 ('evt_founder_zero','invoice.paid',false,'processed',now());
set local role service_role;
select public.founder_record_billing_event('evt_founder_paid','sub_founder_monthly',now()-interval '14 days');
select public.founder_record_billing_event('evt_founder_paid','sub_founder_monthly',now()-interval '14 days');
select public.founder_record_billing_event('evt_founder_replay','sub_founder_monthly',now()-interval '13 days');
select public.founder_record_billing_event('evt_founder_zero','sub_founder_annual',null);
do $$ begin
 if (select count(*) from public.founder_billing_receipts)<>3 or (select count(*) from public.founder_subscription_facts)<>2 then raise exception 'Replay duplicated observations';end if;
 if (select first_paid_at from public.founder_subscription_facts where subscription_id='sub_founder_monthly')<>now()-interval '14 days' then raise exception 'First payment overwritten';end if;
 if (select first_paid_at from public.founder_subscription_facts where subscription_id='sub_founder_annual') is not null then raise exception 'Zero invoice became paid';end if;
 begin perform public.founder_record_billing_event('evt_nonexistent',null,null);raise exception 'Unprocessed event captured';exception when invalid_parameter_value then null;end;
end $$;
reset role;
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.founder_dashboard(30,false);
 if r->'conversion'->>'eligibleTrials'<>'2' or r->'conversion'->>'convertedTrials'<>'1' then raise exception 'Mature cohort or conversion calculation %',r->'conversion';end if;
end $$;
reset role;
insert into public.billing_webhook_events(event_id,event_type,livemode,status,processed_at) values('evt_missing_capture','invoice.paid',false,'processed',now());
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.founder_dashboard(30,false);
 if r->'conversion'->'eligibleTrials'<>'null'::jsonb or r->'conversion'->>'missingCaptures'<>'1' then raise exception 'Missing capture silently became zero';end if;
end $$;
reset role;
set local role service_role;
select public.founder_record_billing_event('evt_missing_capture',null,null);
reset role;
insert into public.billing_webhook_events(event_id,event_type,livemode,status) values('evt_pending_capture','invoice.paid',false,'failed');
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.founder_dashboard(30,false);
 if r->'conversion'->'eligibleTrials'<>'null'::jsonb or r->'conversion'->>'pendingWebhooks'<>'1' then raise exception 'Pending webhook silently included';end if;
end $$;
reset role;
delete from public.billing_webhook_events where event_id='evt_pending_capture';
-- All new raw tables are protected and no public function is a definer.
do $$ begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('founder_admins','founder_reporting_installation','founder_billing_receipts','founder_subscription_facts') and c.relrowsecurity)<>4 then raise exception 'Reporting RLS missing';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'founder_%' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) then raise exception 'Browser raw-table privilege';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'founder_%' and p.prosecdef) then raise exception 'Exposed public definer';end if;
end $$;
-- Even a Founder permission cannot open the dashboard in a Student database.
create table public.student_schools(id uuid);
set local role authenticated;
do $$ begin if public.founder_dashboard_allowed() then raise exception 'Student isolation guard bypass';end if;end $$;
reset role;
drop table public.student_schools;
-- Two distinct instants in the repeated DST hour must share one NY calendar day.
insert into public.check_ins(user_id,mood,mood_score,energy,created_at) values
 ('d1000000-0000-4000-8000-000000000002','steady',3,5,'2026-11-01T01:30:00-04:00'),
 ('d1000000-0000-4000-8000-000000000002','steady',3,5,'2026-11-01T01:30:00-05:00');
set local role authenticated;
do $$ declare n text;begin
 if current_date between '2026-11-02' and '2027-01-28' then
  select x->>'checkIns' into n from jsonb_array_elements(public.founder_dashboard(90,false)->'trend') x where x->>'day'='2026-11-01';
  if n<>'2' then raise exception 'DST duplicate hour calendar mismatch %',n;end if;
 end if;
end $$;
reset role;
update public.founder_admins set active=false;
set local role authenticated;
do $$ begin if public.founder_dashboard_allowed() then raise exception 'Revocation not immediate';end if;end $$;
reset role;
set local role anon;
do $$ begin begin perform public.founder_dashboard();raise exception 'Anonymous report access';exception when insufficient_privilege then null;end;end $$;
reset role;
delete from auth.users where id='d1000000-0000-4000-8000-000000000002';
do $$ begin if exists(select 1 from public.founder_subscription_facts where user_id='d1000000-0000-4000-8000-000000000002') then raise exception 'Account deletion retained personal reporting facts';end if;end $$;
rollback;
\echo 'Founder authorization, counts, capture, privacy and boundary assertions passed; fixtures rolled back.'
