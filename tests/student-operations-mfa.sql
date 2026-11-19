-- Direct RPC regression: server-side checks cannot protect SECURITY DEFINER calls.
-- Included only in student-rls.sql's disposable, synthetic rollback transaction.
reset role;
do $$ begin
 if has_function_privilege('anon','public.student_operations_state()','EXECUTE')
  or not has_function_privilege('authenticated','public.student_operations_state()','EXECUTE')
 then raise exception 'Operations RPC execution grants changed'; end if;
end $$;
insert into auth.users(id) select ('b1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5)i;
insert into public.student_schools(id,name) values
 ('b2000000-0000-4000-8000-000000000001','Synthetic MFA school'),
 ('b2000000-0000-4000-8000-000000000002','Synthetic other MFA school');
insert into public.student_staff_memberships(user_id,school_id,role,active) values
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','teacher',true),
 ('b1000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','teacher',true);
insert into public.student_staff_applications(user_id,display_name,school_name,requested_role) values
 ('b1000000-0000-4000-8000-000000000002','Synthetic pending applicant','Synthetic MFA school','teacher');
insert into public.student_operators(user_id) values('b1000000-0000-4000-8000-000000000004');
insert into public.student_classrooms(id,school_id,teacher_id,label) values
 ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Synthetic own class'),
 ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003','Synthetic other class');
insert into public.student_class_records(classroom_id,day,enrolled,present,absent) values
 ('b3000000-0000-4000-8000-000000000001',current_date,20,19,1),
 ('b3000000-0000-4000-8000-000000000002',current_date,20,18,2);
-- An unverified enrollment must not lock out a user, nor count as verified MFA.
insert into auth.mfa_factors values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000001','unverified');
set local role authenticated;
select set_config('request.headers','{}',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.aal','aal1',true);
do $$ begin
 if jsonb_array_length(public.student_operations_state()->'records') is distinct from 1 then
  raise exception 'Staff without verified MFA lost existing opt-in access';
 end if;
end $$;
reset role;
update auth.mfa_factors set status='verified' where user_id='b1000000-0000-4000-8000-000000000001';
insert into auth.mfa_factors values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000004','verified');
set local role authenticated;
-- This is the regression that fails on the pre-fix function: direct RLS denies,
-- but the old RPC still returns the teacher's class and attendance record.
do $$ begin
 if exists(select 1 from public.student_class_records) then raise exception 'AAL1 direct RLS unexpectedly allowed'; end if;
 begin
  perform public.student_operations_state();
  raise exception 'MFA regression: AAL1 operations RPC disclosed protected state';
 exception when insufficient_privilege then null; end;
end $$;
-- Missing/unknown assurance must fail closed for enrolled staff too.
select set_config('request.jwt.claim.aal','',true);
do $$ begin
 begin perform public.student_operations_state(); raise exception 'Missing AAL accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.aal','aal2',true);
do $$ declare s jsonb; begin
 s:=public.student_operations_state();
 if s->>'role' is distinct from 'teacher' or s->>'schoolId' is distinct from 'b2000000-0000-4000-8000-000000000001'
  or jsonb_array_length(s->'classes') is distinct from 1 or jsonb_array_length(s->'records') is distinct from 1
  or s->'records'->0->>'classroom_id' is distinct from 'b3000000-0000-4000-8000-000000000001'
 then raise exception 'AAL2 teacher lost access or crossed class/school scope'; end if;
 if exists(select 1 from public.student_messages) or exists(select 1 from public.student_goals)
 then raise exception 'Teacher gained private student data'; end if;
end $$;
-- Revocation still applies even with a verified second-factor session.
reset role;
update public.student_staff_memberships set active=false where user_id='b1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare s jsonb; begin
 s:=public.student_operations_state();
 if s->>'role' is not null or s->>'schoolId' is not null
  or jsonb_array_length(s->'classes') is distinct from 0 or jsonb_array_length(s->'records') is distinct from 0
 then raise exception 'Revoked teacher retains operations data'; end if;
end $$;
-- Pending/new accounts still get onboarding, not privileged data or a role.
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.aal','aal1',true);
do $$ declare s jsonb; begin
 s:=public.student_operations_state();
 if s->'application'->>'status' is distinct from 'pending' or s->>'role' is not null
  or (s->>'operator')::boolean is distinct from false or jsonb_array_length(s->'records') is distinct from 0
 then raise exception 'Pending applicant onboarding or privilege isolation changed'; end if;
end $$;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000005',true);
do $$ declare s jsonb; begin
 s:=public.student_operations_state();
 if s->>'role' is not null or s->'application' is distinct from 'null'::jsonb or jsonb_array_length(s->'classes') is distinct from 0
 then raise exception 'New account onboarding changed'; end if;
end $$;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
do $$ begin
 begin perform public.student_operations_state(); raise exception 'Enrolled operator bypassed MFA'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.aal','aal2',true);
do $$ begin
 if (public.student_operations_state()->>'operator')::boolean is distinct from true then raise exception 'AAL2 operator denied'; end if;
end $$;
-- Both unauthenticated invocation paths remain unavailable.
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin perform public.student_operations_state(); raise exception 'Missing identity accepted'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.student_operations_state(); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'Operations RPC MFA, onboarding, revocation and school-isolation assertions passed.'
