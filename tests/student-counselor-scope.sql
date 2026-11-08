-- Synthetic local fixtures only. Included in the enclosing rollback transaction.
reset role;
insert into auth.users(id) values
 ('60000000-0000-4000-8000-000000000001'),('60000000-0000-4000-8000-000000000002'),
 ('60000000-0000-4000-8000-000000000003'),('60000000-0000-4000-8000-000000000004');
insert into public.student_schools(id,name,time_zone)
 select ('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic assigned school '||i,'America/New_York' from generate_series(1,6)i;
insert into public.student_staff_memberships(user_id,school_id,role) values
 ('60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','therapist'),
 ('60000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','school_staff');
insert into public.student_counselor_assignments(user_id,school_id)
 select '60000000-0000-4000-8000-000000000001',('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5)i;
insert into public.student_pilot_memberships(user_id,school_id,status,consent_verified_at) values
 ('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','active',now()),
 ('60000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002','active',now());
insert into public.student_counselor_requests(id,user_id,school_id,display_name) values
 ('80000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','Synthetic request A'),
 ('80000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002','Synthetic request B');
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.aal','aal1',true);
select set_config('request.headers','{}',true);
do $$ declare s uuid; begin
 if public.student_staff_scope()->>'schoolId'<>'70000000-0000-4000-8000-000000000001' then raise exception 'Legacy primary scope changed';end if;
 if jsonb_array_length(public.student_staff_scope()->'schools')<>5 then raise exception 'Five-school scope missing';end if;
 for i in 1..5 loop
  s:=('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  perform set_config('request.headers',jsonb_build_object('x-arize-school',s)::text,true);
  if public.student_staff_scope()->>'schoolId'<>s::text then raise exception 'Assigned school cannot be selected';end if;
  if exists(select 1 from public.student_messages) or exists(select 1 from public.student_goals) or exists(select 1 from public.student_check_ins)
  then raise exception 'Cross-school therapist acquired private student records';end if;
 end loop;
 perform set_config('request.headers','{"x-arize-school":"70000000-0000-4000-8000-000000000006"}',true);
 begin perform public.student_staff_scope();raise exception 'Unassigned school accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.headers','{"x-arize-school":"not-a-school"}',true);
 begin perform public.student_staff_scope();raise exception 'Invalid school accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.headers','{"x-arize-school":"70000000-0000-4000-8000-000000000002"}',true);
 if jsonb_array_length(public.student_therapist_requests()->'requests')<>1 or public.student_therapist_requests()->'requests'->0->>'display_name'<>'Synthetic request B' then raise exception 'Inbox school isolation failed';end if;
 begin perform public.student_update_followup('80000000-0000-4000-8000-000000000001','closed');raise exception 'Cross-school update accepted';exception when insufficient_privilege then null;end;
 perform public.student_update_followup('80000000-0000-4000-8000-000000000002','acknowledged');
 perform public.student_save_counselor_email('synthetic-counselor@example.test');
 if not exists(select 1 from public.student_counselor_settings where school_id='70000000-0000-4000-8000-000000000002' and recipient_email='synthetic-counselor@example.test') then raise exception 'Notification change used wrong scope';end if;
 begin insert into public.student_counselor_assignments(user_id,school_id) values(auth.uid(),'70000000-0000-4000-8000-000000000006');raise exception 'Self-assignment accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.student_counselor_assignments set active=false where user_id='60000000-0000-4000-8000-000000000001' and school_id='70000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin begin perform public.student_staff_scope();raise exception 'Revoked school accepted';exception when insufficient_privilege then null;end;end $$;
reset role;
update public.student_staff_memberships set active=false where user_id='60000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.headers','{}',true);
do $$ begin
 begin perform public.student_staff_scope();raise exception 'Revoked staff accepted';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.student_counselor_assignments) then raise exception 'Revoked counselor retains assignment access';end if;
end $$;
reset role;
update public.student_staff_memberships set active=true where user_id='60000000-0000-4000-8000-000000000001';
insert into auth.mfa_factors values(gen_random_uuid(),'60000000-0000-4000-8000-000000000001','verified');
set local role authenticated;
do $$ begin begin perform public.student_staff_scope();raise exception 'MFA bypassed by assignment';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.aal','aal2',true);
do $$ begin if jsonb_array_length(public.student_staff_scope()->'schools')<>4 then raise exception 'AAL2 scoped counselor denied';end if;end $$;
reset role;
\echo 'Counselor five-school scope, revocation, MFA, notification and private-record assertions passed.'
