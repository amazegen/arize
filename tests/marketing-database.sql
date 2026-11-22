\set ON_ERROR_STOP on
begin;
set local role anon;
do $$ begin
 begin perform public.marketing_capture_lead('fictional@example.test',repeat('a',64),repeat('b',64),'arize-marketing-2026-11-22');raise exception 'Anonymous direct capture';exception when insufficient_privilege then null;end;
 begin perform * from public.marketing_leads;raise exception 'Anonymous lead read';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.marketing_claim_notification(null,repeat('a',64));raise exception 'Authenticated notification access';exception when insufficient_privilege then null;end;
 begin perform public.marketing_purge_expired();raise exception 'Authenticated purge';exception when insufficient_privilege then null;end;
 begin insert into public.marketing_leads(email,consent_version) values('bypass@example.test','arize-marketing-2026-11-22');raise exception 'Browser bypassed form';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare r jsonb; id uuid; claim jsonb; next_claim jsonb; i integer;
begin
 r:=public.marketing_capture_lead('fictional@example.test',repeat('a',64),repeat('b',64),'arize-marketing-2026-11-22');
 id:=(r->>'leadId')::uuid;
 if r->>'accepted'<>'true' or id is null then raise exception 'New lead not saved';end if;
 r:=public.marketing_capture_lead('fictional@example.test',repeat('a',64),repeat('b',64),'arize-marketing-2026-11-22');
 if r->>'accepted'<>'true' or r->'leadId'<>'null'::jsonb or (select count(*) from public.marketing_leads)<>1 then raise exception 'Duplicate replay';end if;
 perform public.marketing_capture_lead('fictional@example.test',repeat('a',64),repeat('b',64),'arize-marketing-2026-11-22');
 if public.marketing_capture_lead('fictional@example.test',repeat('a',64),repeat('b',64),'arize-marketing-2026-11-22')->>'accepted'<>'false' then raise exception 'Email quota bypass';end if;
 if (select notification_attempts from public.marketing_leads where email='fictional@example.test')<>0 then raise exception 'Capture sent a notification';end if;
 claim:=public.marketing_claim_notification(id,repeat('c',64));
 if claim->>'email'<>'fictional@example.test' then raise exception 'Claim missing lead';end if;
 if public.marketing_claim_notification(id,repeat('c',64)) is not null then raise exception 'Concurrent notification lease';end if;
 if public.marketing_finish_notification(id,gen_random_uuid(),'sent') then raise exception 'Forged finish token';end if;
 if not public.marketing_finish_notification(id,(claim->>'token')::uuid,'retry') then raise exception 'Retry not recorded';end if;
 if public.marketing_claim_notification(id,repeat('c',64)) is not null then raise exception 'Retry backoff missing';end if;
 update public.marketing_leads set notification_next_at=now()-interval '1 second' where email='fictional@example.test';
 next_claim:=public.marketing_claim_notification(id,repeat('c',64));
 if next_claim->>'id'<>claim->>'id' then raise exception 'Retry changed idempotency ID';end if;
 if not public.marketing_finish_notification(id,(next_claim->>'token')::uuid,'sent') then raise exception 'Successful notification not saved';end if;
 if public.marketing_claim_notification(id,repeat('c',64)) is not null then raise exception 'Sent notification repeated';end if;
 for i in 1..10 loop
  r:=public.marketing_capture_lead('fictional-ip-'||i||'@example.test',repeat('d',64),md5(i::text)||md5(i::text),'arize-marketing-2026-11-22');
  if r->>'accepted'<>'true' then raise exception 'IP quota too small';end if;
 end loop;
 if public.marketing_capture_lead('fictional-ip-11@example.test',repeat('d',64),repeat('e',64),'arize-marketing-2026-11-22')->>'accepted'<>'false' then raise exception 'IP quota missing';end if;
 begin perform public.marketing_capture_lead('invalid',repeat('a',64),repeat('b',64),'arize-marketing-2026-11-22');raise exception 'Invalid email';exception when invalid_parameter_value then null;end;
 begin perform public.marketing_capture_lead('valid@example.test',repeat('a',64),repeat('b',64),null);raise exception 'Missing consent';exception when invalid_parameter_value then null;end;
end $$;
-- Expired leases can recover, but aged/changed-recipient attempts need review.
do $$ declare id uuid; claim jsonb; removed integer;begin
 insert into public.marketing_leads(email,consent_version,notification_status,notification_attempts,notification_first_attempt,notification_config_hash,notification_lease_until)
 values('stale@example.test','arize-marketing-2026-11-22','sending',1,now()-interval '24 hours',repeat('c',64),now()-interval '1 minute') returning marketing_leads.id into id;
 claim:=public.marketing_claim_notification(id,repeat('c',64));
 if claim is not null or (select notification_status from public.marketing_leads where email='stale@example.test')<>'review' then raise exception 'Unsafe retry outside provider window';end if;
 insert into public.marketing_leads(email,consent_version,notification_attempts,notification_first_attempt,notification_config_hash)
 values('changed@example.test','arize-marketing-2026-11-22',1,now(),repeat('c',64)) returning marketing_leads.id into id;
 claim:=public.marketing_claim_notification(id,repeat('f',64));
 if claim is not null or (select notification_status from public.marketing_leads where email='changed@example.test')<>'review' then raise exception 'Config changed after uncertain delivery';end if;
 insert into public.marketing_leads(email,consent_version,notification_status,notification_attempts,notification_first_attempt,notification_config_hash,notification_lease_until)
 values('expired-lease@example.test','arize-marketing-2026-11-22','sending',1,now(),repeat('c',64),now()-interval '1 minute') returning marketing_leads.id into id;
 claim:=public.marketing_claim_notification(id,repeat('c',64));
 if claim is null then raise exception 'Expired lease stuck';end if;
 update public.marketing_leads set notification_attempts=5 where email='expired-lease@example.test';
 perform public.marketing_finish_notification(id,(claim->>'token')::uuid,'retry');
 if (select notification_status from public.marketing_leads where email='expired-lease@example.test')<>'review' then raise exception 'Retry cap missing';end if;
 insert into public.marketing_leads(email,consent_version,created_at) values('expired@example.test','arize-marketing-2026-11-22',now()-interval '181 days');
 removed:=public.marketing_purge_expired();
 if removed<>1 or exists(select 1 from public.marketing_leads where email='expired@example.test') then raise exception 'Lead retention purge';end if;
 insert into public.marketing_leads(email,consent_version,created_at) values('renew-optin@example.test','arize-marketing-2026-11-22',now()-interval '181 days') returning marketing_leads.id into id;
 claim:=public.marketing_capture_lead('renew-optin@example.test',repeat('1',64),repeat('2',64),'arize-marketing-2026-11-22');
 if claim->>'leadId' is null or (claim->>'leadId')::uuid=id or (select consent_at from public.marketing_leads where email='renew-optin@example.test')<>now() then raise exception 'Fresh opt-in swallowed by expired record';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from pg_class where relname in ('marketing_leads','marketing_rate_limits') and relrowsecurity)<>2 then raise exception 'RLS missing';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'marketing_%' and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'Function privileges unsafe';end if;
end $$;
create table public.student_schools(id uuid);
set local role service_role;
do $$ begin
 begin perform public.marketing_capture_lead('blocked@example.test',repeat('a',64),repeat('b',64),'arize-marketing-2026-11-22');raise exception 'Student capture allowed';exception when insufficient_privilege then null;end;
 begin perform public.marketing_claim_notification(null,repeat('c',64));raise exception 'Student notification allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
drop table public.student_schools;
rollback;
\echo 'Marketing permissions, quotas, idempotency, delivery leases, retention and Student isolation passed; fixtures rolled back.'
