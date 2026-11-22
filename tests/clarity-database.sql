-- Included in a synthetic local fixture only. Caller owns rollback transaction.
insert into auth.users(id,email) values
 ('c1000000-0000-4000-8000-000000000001','clarity-admin@example.test'),
 ('c1000000-0000-4000-8000-000000000002','ordinary-user@example.test');
do $$ begin
 if exists(select 1 from pg_tables where schemaname='public' and tablename like 'clarity_%' and not rowsecurity) then raise exception 'RLS missing'; end if;
 if (select edition from public.clarity_installation)='student' then
   insert into public.student_operators(user_id) values('c1000000-0000-4000-8000-000000000001');
 else insert into public.clarity_admins(user_id) values('c1000000-0000-4000-8000-000000000001'); end if;
end $$;
select set_config('test.clarity.edition',(select edition from public.clarity_installation),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.aal','aal1',true);
do $$ declare e text:=current_setting('test.clarity.edition'); begin
 if public.clarity_console_allowed(e) then raise exception 'Ordinary user is admin'; end if;
 begin perform public.clarity_console_state(e);raise exception 'Private history leaked';exception when insufficient_privilege then null;end;
 begin perform public.clarity_change_config(e,'save','{}','self promote');raise exception 'Self publish allowed';exception when insufficient_privilege then null;end;
 begin insert into public.clarity_admins values(auth.uid(),true);raise exception 'Role self promotion';exception when insufficient_privilege then null;end;
 begin select count(*) from public.clarity_config_versions;raise exception 'Direct history read allowed';exception when insufficient_privilege then null;end;
 begin update public.clarity_config_head set version_id=null;raise exception 'Direct head write';exception when insufficient_privilege then null;end;
 if public.clarity_active_config(e) is not null then raise exception 'Unexpected initial publication';end if;
end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ declare e text:=current_setting('test.clarity.edition'); c jsonb; v uuid; newer uuid; restored uuid; state jsonb;begin
 c:=jsonb_build_object('personality','Synthetic','tone','Warm','voiceGuidance','Direct','greetingStyle','Specific','instructions','One step','responseBoundaries','Brief');
 if not public.clarity_console_allowed(e) then raise exception 'Verified admin denied';end if;
 if public.clarity_console_allowed(case e when 'adult' then 'student' else 'adult' end) then raise exception 'Cross-edition administration allowed';end if;
 begin perform public.clarity_change_config(e,'save',c||'{"safetyEnabled":false}','Unsafe extra field');raise exception 'Safety field accepted';exception when invalid_parameter_value then null;end;
 begin perform public.clarity_change_config(e,'save',c||jsonb_build_object('tone',repeat('x',2001)),'Too long');raise exception 'Oversize accepted';exception when invalid_parameter_value then null;end;
 begin perform public.clarity_change_config(e,'save',c,'');raise exception 'Missing audit note';exception when invalid_parameter_value then null;end;
 v:=public.clarity_change_config(e,'save',c,'First synthetic draft');
 if public.clarity_active_config(e) is not null then raise exception 'Draft changed live config';end if;
 perform public.clarity_change_config(e,'publish',null,null,v,null);
 if public.clarity_active_config(e)->>'id' is distinct from v::text then raise exception 'Publish failed';end if;
 newer:=public.clarity_change_config(e,'save',c||'{"tone":"Reflective"}','Second draft');
 perform public.clarity_change_config(e,'publish',null,null,newer,v);
 begin perform public.clarity_change_config(e,'publish',null,null,v,v);raise exception 'Stale publish overwrote new head';exception when serialization_failure then null;end;
 restored:=public.clarity_change_config(e,'restore',null,'Restore prior settings',v,newer);
 if restored=v or public.clarity_active_config(e)->>'id' is distinct from restored::text or public.clarity_active_config(e)->'config' is distinct from c then raise exception 'Restore did not create a new active version';end if;
 state:=public.clarity_console_state(e);
 if jsonb_array_length(state->'versions')<>3 or jsonb_array_length(state->'audit')<>5 then raise exception 'History/audit not preserved';end if;
 if state->'versions'->0->>'actor_email' is distinct from 'clarity-admin@example.test' then raise exception 'Admin attribution missing';end if;
 if not public.clarity_claim_preview(e,'c2000000-0000-4000-8000-000000000001') then raise exception 'Preview claim denied';end if;
 if public.clarity_claim_preview(e,'c2000000-0000-4000-8000-000000000001') then raise exception 'Duplicate preview claim allowed';end if;
 for i in 2..5 loop perform public.clarity_claim_preview(e,gen_random_uuid());end loop;
 if public.clarity_claim_preview(e,gen_random_uuid()) then raise exception 'Preview burst limit bypassed';end if;
end $$;
reset role;
insert into auth.mfa_factors(id,user_id,status) values(gen_random_uuid(),'c1000000-0000-4000-8000-000000000001','verified');
set local role authenticated;
select set_config('request.jwt.claim.aal','aal1',true);
do $$ begin
 if public.clarity_console_allowed(current_setting('test.clarity.edition')) then raise exception 'AAL1 bypassed enrolled MFA';end if;
 begin perform public.clarity_console_state(current_setting('test.clarity.edition'));raise exception 'MFA history bypass';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.aal','aal2',true);
do $$ begin if not public.clarity_console_allowed(current_setting('test.clarity.edition')) then raise exception 'AAL2 admin denied';end if;end $$;
reset role;
do $$ begin
 update public.clarity_admins set active=false where user_id='c1000000-0000-4000-8000-000000000001';
 if current_setting('test.clarity.edition')='student' then update public.student_operators set active=false where user_id='c1000000-0000-4000-8000-000000000001';end if;
end $$;
set local role authenticated;
do $$ begin if public.clarity_console_allowed(current_setting('test.clarity.edition')) then raise exception 'Revoked role retained config access';end if;end $$;
set local role anon;
do $$ begin
 begin perform public.clarity_console_state('adult');raise exception 'Anonymous console access';exception when insufficient_privilege then null;end;
 begin perform public.clarity_active_config('adult');raise exception 'Anonymous config access';exception when insufficient_privilege then null;end;
end $$;
reset role;
\echo 'Clarity versions, audit, publish conflicts, role/MFA isolation and preview limits passed.'
