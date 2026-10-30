-- New writes must go through moderation in the server, never the browser role.
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.student_reserve_coach_turn(uuid,text)','EXECUTE')
 or has_function_privilege('anon','public.student_begin_ai_request(uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.student_store_approved_turn(uuid,uuid,uuid,text)','EXECUTE')
 or has_table_privilege('authenticated','public.student_ai_requests','SELECT') then raise exception 'Unsafe AI grant'; end if;
end $$;
insert into auth.users(id) values('a0000000-0000-4000-8000-000000000001');
insert into public.student_pilot_memberships(user_id,school_id,status,consent_verified_at)
values('a0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active',now());
insert into public.student_profiles(user_id,display_name,grade,notice_version)
values('a0000000-0000-4000-8000-000000000001','Synthetic','10','student-pilot-2026-10-29-v4');
set local role service_role;
do $$ declare u uuid:='a0000000-0000-4000-8000-000000000001'; r uuid:='b0000000-0000-4000-8000-000000000001'; c uuid; v jsonb;
begin
 v:=public.student_begin_ai_request(u,r,'student',repeat('a',64));
 if v->>'state'<>'new' then raise exception 'Not new'; end if;
 begin
  perform public.student_begin_ai_request(u,gen_random_uuid(),'student',repeat('b',64));
  raise exception 'Concurrent request allowed';
 exception when lock_not_available then null; end;
 c:=public.student_store_approved_turn(u,r,null,'Synthetic approved message');
 if public.student_store_approved_turn(u,r,null,'Synthetic approved message')<>c then raise exception 'Duplicate user turn'; end if;
 perform public.student_finish_ai_request(u,r,'student','completed','Synthetic safe reply');
 perform public.student_finish_ai_request(u,r,'student','completed','Synthetic safe reply');
 v:=public.student_begin_ai_request(u,r,'student',repeat('a',64));
 if v->>'state'<>'completed' or v->>'content'<>'Synthetic safe reply' then raise exception 'Retry not cached'; end if;
 begin perform public.student_begin_ai_request(u,r,'student',repeat('b',64)); raise exception 'Changed request allowed'; exception when invalid_parameter_value then null; end;
 r:=gen_random_uuid();
 perform public.student_begin_ai_request(u,r,'student',repeat('b',64));
 perform public.student_finish_ai_request(u,r,'student','blocked','Synthetic safety reply');
end $$;
reset role;
do $$ begin
 if (select count(*) from public.student_messages where user_id='a0000000-0000-4000-8000-000000000001')<>2 then raise exception 'Duplicate or blocked input saved'; end if;
 if (select count from public.student_coach_usage where user_id='a0000000-0000-4000-8000-000000000001')<>1 then raise exception 'Retry spent quota twice'; end if;
end $$;
update public.student_profiles set notice_version='old' where user_id='a0000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
 begin perform public.student_begin_ai_request('a0000000-0000-4000-8000-000000000001',gen_random_uuid(),'student',repeat('c',64)); raise exception 'Old notice allowed'; exception when insufficient_privilege then null; end;
 begin perform public.student_begin_ai_request('a0000000-0000-4000-8000-000000000001',gen_random_uuid(),'operator',repeat('c',64)); raise exception 'Student impersonated operator'; exception when insufficient_privilege then null; end;
end $$;
reset role;
