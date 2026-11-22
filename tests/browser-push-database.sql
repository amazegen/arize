-- Disposable LOCAL database after marketing-bootstrap.sql + browser_push only.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('f1000000-0000-4000-8000-000000000001','push-one@example.test'),
 ('f1000000-0000-4000-8000-000000000002','push-two@example.test'),
 ('f1000000-0000-4000-8000-000000000003','push-empty@example.test');
insert into public.legal_consents(user_id,terms_version,privacy_version)
 select id,'2.0','2.0' from auth.users where email like 'push-%@example.test';
insert into public.check_ins(user_id,mood,mood_score,energy) values
 ('f1000000-0000-4000-8000-000000000001','steady',3,5),('f1000000-0000-4000-8000-000000000002','steady',3,5);
set local role authenticated;
do $$ begin
 begin perform * from public.browser_push_subscriptions;raise exception 'Browser read allowed';exception when insufficient_privilege then null;end;
 begin perform public.browser_push_claim();raise exception 'Browser worker allowed';exception when insufficient_privilege then null;end;
 begin perform public.browser_push_manage('f1000000-0000-4000-8000-000000000001','state');raise exception 'Browser RPC allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare a uuid:='f1000000-0000-4000-8000-000000000001';b uuid:='f1000000-0000-4000-8000-000000000002';r jsonb;claims jsonb;job jsonb;i integer;
begin
 if public.browser_push_eligible('f1000000-0000-4000-8000-000000000003') then raise exception 'Login alone eligible';end if;
 insert into public.goals(user_id,title) values('f1000000-0000-4000-8000-000000000003','Fictional goal');
 if public.browser_push_eligible('f1000000-0000-4000-8000-000000000003') then raise exception 'Incomplete goal eligible';end if;
 update public.goals set is_complete=true where user_id='f1000000-0000-4000-8000-000000000003';
 if not public.browser_push_eligible('f1000000-0000-4000-8000-000000000003') then raise exception 'Completed goal ineligible';end if;
 delete from public.legal_consents where user_id='f1000000-0000-4000-8000-000000000003';
 if public.browser_push_eligible('f1000000-0000-4000-8000-000000000003') then raise exception 'Missing legal acceptance allowed';end if;
 r:=public.browser_push_manage(a,'register',repeat('a',64),'{"endpoint":"https://fcm.googleapis.com/fcm/send/fixture","expirationTime":null,"keys":{"p256dh":"fixture","auth":"fixture"}}',to_char(now() at time zone 'UTC'-interval '1 minute','HH24:MI'),'UTC');
 if r->>'enabled'<>'true' or r->>'subscribed'<>'true' then raise exception 'Registration failed: %',r;end if;
 r:=public.browser_push_manage(b,'state',repeat('a',64));
 if r->>'subscribed'<>'false' or r ? 'subscription' then raise exception 'Cross-user state leaked';end if;
 r:=public.browser_push_manage(b,'register',repeat('a',64),'{}','09:00','UTC');
 if r->>'error'<>'owned' then raise exception 'Endpoint reassigned';end if;
 perform public.browser_push_manage(b,'disable',repeat('a',64));
 if not exists(select 1 from public.browser_push_subscriptions where user_id=a) then raise exception 'Cross-user disable';end if;
 claims:=public.browser_push_claim();
 if jsonb_array_length(claims)<>1 then raise exception 'Due claim absent: %',claims;end if;
 job:=claims->0;
 if jsonb_array_length(public.browser_push_claim())<>0 then raise exception 'Concurrent duplicate lease';end if;
 if public.browser_push_finish((job->>'id')::uuid,gen_random_uuid(),'sent') then raise exception 'Forged lease';end if;
 if not public.browser_push_lease_valid((job->>'id')::uuid,(job->>'token')::uuid) then raise exception 'Valid lease rejected';end if;
 perform public.browser_push_finish((job->>'id')::uuid,(job->>'token')::uuid,'retry');
 if jsonb_array_length(public.browser_push_claim())<>0 then raise exception 'No retry backoff';end if;
 update public.browser_push_jobs set next_at=now()-interval '1 second';
 claims:=public.browser_push_claim();job:=claims->0;
 perform public.browser_push_finish((job->>'id')::uuid,(job->>'token')::uuid,'sent');
 if jsonb_array_length(public.browser_push_claim())<>0 then raise exception 'Same-day duplicate';end if;
 update public.browser_push_preferences set updated_at=now()-interval '2 seconds' where user_id=a;
 perform public.browser_push_manage(a,'schedule',null,null,'23:59','America/New_York');
 if jsonb_array_length(public.browser_push_claim())<>0 then raise exception 'Schedule change duplicate';end if;
 for i in 1..4 loop
  update public.browser_push_preferences set updated_at=now()-interval '2 seconds' where user_id=a;
  perform public.browser_push_manage(a,'register',md5(i::text)||md5(i::text),'{}','09:00','UTC');
 end loop;
 update public.browser_push_preferences set updated_at=now()-interval '2 seconds' where user_id=a;
 if public.browser_push_manage(a,'register',repeat('f',64),'{}','09:00','UTC')->>'error'<>'device_limit' then raise exception 'Device limit missing';end if;
 perform public.browser_push_manage(a,'disable',repeat('a',64));
 if exists(select 1 from public.browser_push_jobs) then raise exception 'Unsubscribe did not cascade';end if;
 -- A pending delivery is invalidated by changing its schedule.
 update public.browser_push_preferences set updated_at=now()-interval '2 seconds' where user_id=a;
 insert into public.browser_push_jobs(subscription_id,local_day,preference_version,due_at,expires_at,status,attempts,lease_token,lease_until)
 select s.id,current_date,p.version,now(),now()+interval '10 minutes','sending',1,gen_random_uuid(),now()+interval '2 minutes'
 from public.browser_push_subscriptions s join public.browser_push_preferences p on p.user_id=s.user_id where s.user_id=a limit 1 returning jsonb_build_object('id',id,'token',lease_token) into job;
 perform public.browser_push_manage(a,'schedule',null,null,'23:58','UTC');
 if public.browser_push_lease_valid((job->>'id')::uuid,(job->>'token')::uuid) then raise exception 'Schedule revocation ignored';end if;
 delete from public.browser_push_jobs;
end $$;
-- Synthetic lease, deletion, expiry and bounded retry checks.
do $$ declare a uuid:='f1000000-0000-4000-8000-000000000001';s uuid;j uuid;t uuid:=gen_random_uuid();claims jsonb;begin
 select id into s from public.browser_push_subscriptions where user_id=a limit 1;
 insert into public.browser_push_jobs(subscription_id,local_day,preference_version,due_at,expires_at,status,attempts,lease_token,lease_until)
 select s,current_date,version,now(),now()+interval '10 minutes','sending',3,t,now()+interval '2 minutes' from public.browser_push_preferences where user_id=a returning id into j;
 perform public.browser_push_finish(j,t,'retry');
 if (select status from public.browser_push_jobs where id=j)<>'failed' then raise exception 'Infinite retry';end if;
 update public.browser_push_jobs set status='sending',attempts=1,lease_token=t,lease_until=now()-interval '1 second',next_at=now()-interval '1 second' where id=j;
 claims:=public.browser_push_claim();
 if jsonb_array_length(claims)<>1 then raise exception 'Expired lease did not recover';end if;
 t:=(claims->0->>'token')::uuid;
 insert into public.account_deletion_jobs(user_id,stage) values(a,'billing');
 if public.browser_push_lease_valid(j,t) then raise exception 'Deleting account can send';end if;
 delete from public.account_deletion_jobs where user_id=a;
 update public.browser_push_jobs set expires_at=now()-interval '1 second' where id=j;
 if public.browser_push_lease_valid(j,t) or jsonb_array_length(public.browser_push_claim())<>0 then raise exception 'Expired job can send';end if;
 update public.browser_push_jobs set status='sending',lease_token=t where id=j;
 perform public.browser_push_finish(j,t,'gone');
 if exists(select 1 from public.browser_push_subscriptions where id=s) then raise exception '410 not removed';end if;
 delete from auth.users where id=a;
 if exists(select 1 from public.browser_push_preferences where user_id=a) or exists(select 1 from public.browser_push_subscriptions where user_id=a) then raise exception 'Account deletion did not cascade';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from pg_class where relname in ('browser_push_preferences','browser_push_subscriptions','browser_push_jobs') and relrowsecurity)<>3 then raise exception 'RLS missing';end if;
 if exists(select 1 from pg_proc p where p.proname like 'browser_push_%' and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'Unsafe function grants';end if;
 -- PG resolves the repeated fall hour to standard time; spring gap moves forward.
 if (timestamp '2026-11-01 01:30' at time zone 'America/New_York')<>timestamptz '2026-11-01 06:30Z' then raise exception 'Fall DST rule';end if;
 if (timestamp '2026-03-08 02:30' at time zone 'America/New_York')<>timestamptz '2026-03-08 07:30Z' then raise exception 'Spring DST rule';end if;
end $$;
create table public.student_schools(id uuid);
set local role service_role;
do $$ begin
 if public.browser_push_eligible('f1000000-0000-4000-8000-000000000002') then raise exception 'Student eligible';end if;
 begin perform public.browser_push_claim();raise exception 'Student dispatch';exception when insufficient_privilege then null;end;
 begin perform public.browser_push_manage('f1000000-0000-4000-8000-000000000002','state');raise exception 'Student manage';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
\echo 'Browser push ownership, RLS, queue, retry, revocation, deletion, DST and Student-isolation tests passed (rolled back).'
