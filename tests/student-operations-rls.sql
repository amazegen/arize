-- Runs inside the disposable database transaction, then the caller rolls back.
insert into auth.users(id) values
('10000000-0000-4000-8000-000000000010'),
('10000000-0000-4000-8000-000000000011'),
('10000000-0000-4000-8000-000000000012');
insert into public.student_operators(user_id) values('10000000-0000-4000-8000-000000000010');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
select public.student_apply_staff('Synthetic teacher','Synthetic school','teacher');
do $$ begin
 if (public.student_operations_state()->>'role') is not null then raise exception 'Application self-grants role'; end if;
 begin perform public.student_create_class('Test');raise exception 'Pending account creates class';exception when insufficient_privilege then null;end;
 begin perform public.student_operator_overview();raise exception 'Pending account opens business view';exception when insufficient_privilege then null;end;
 begin perform public.student_review_staff(auth.uid(),'20000000-0000-4000-8000-000000000001',true,true);raise exception 'Self-approval allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',true);
select public.student_review_staff('10000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001',true,true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
do $$ declare c uuid;begin
 c:=public.student_create_class('Synthetic period 1');
 perform public.student_save_class_record(c,(now() at time zone 'UTC')::date,25,23,2,'fresh-start');
 perform public.student_save_class_record(c,(now() at time zone 'UTC')::date,25,24,1,'before-a-test');
 if (select count(*) from public.student_class_records)<>1 then raise exception 'Attendance edit duplicates class/day'; end if;
 if (select present from public.student_class_records)<>24 then raise exception 'Attendance did not persist';end if;
 begin perform public.student_save_class_record(c,(now() at time zone 'UTC')::date,25,24,4,null);raise exception 'Invalid counts accepted';exception when check_violation then null;end;
 if exists(select 1 from public.student_goals) or exists(select 1 from public.student_messages) then raise exception 'Teacher sees private activity';end if;
 begin perform public.student_therapist_requests();raise exception 'Teacher sees counselor inbox';exception when insufficient_privilege then null;end;
 begin perform public.student_publish_completed_period((date_trunc('month',now())-interval '1 month')::date);raise exception 'Teacher publishes school report';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Historical synthetic dataset to verify real aggregate calculations, not just
-- empty/suppressed results. The trigger is disabled ONLY in this disposable
-- rollback transaction to seed a historical acknowledgement time.
insert into public.student_schools(id,name) values('20000000-0000-4000-8000-000000000003','Synthetic aggregate school');
insert into public.student_reporting_approvals values('20000000-0000-4000-8000-000000000003',now(),'Synthetic report test');
insert into auth.users(id) select ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,40)i;
insert into public.student_pilot_memberships(user_id,school_id,status,consent_verified_at,created_at)
select id,'20000000-0000-4000-8000-000000000003','active',now()-interval '90 days',now()-interval '90 days' from auth.users where id::text like '90000000-%';
alter table public.student_profiles disable trigger student_reporting_notice_stamp;
insert into public.student_profiles(user_id,display_name,grade,notice_version,reporting_ack_at)
select id,'Synthetic aggregate student','10','student-pilot-2026-10-29-v4',now()-interval '90 days' from auth.users where id::text like '90000000-%';
alter table public.student_profiles enable trigger student_reporting_notice_stamp;
insert into public.student_topic_choices(user_id,topic,recorded_at)
select id,'tests',date_trunc('month',now())-interval '2 months'+interval '15 days' from auth.users where id::text like '90000000-%' order by id limit 20;
insert into public.student_belonging_pulses(user_id,week_of,welcome,trusted_adult,connection,language,notice_version,acknowledged_at)
select id,date_trunc('week',date_trunc('month',now())-interval '2 months'+interval '15 days')::date,
case when row_number() over(order by id)<=20 then 4 else 2 end,4,3,'en','belonging-pilot-2026-10-29-v2',date_trunc('month',now())-interval '2 months'+interval '15 days'
from auth.users where id::text like '90000000-%';
insert into public.student_classrooms(id,school_id,teacher_id,label) values('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000012','Synthetic historic class');
insert into public.student_class_records(classroom_id,day,enrolled,present,absent,reset_lesson)
values('70000000-0000-4000-8000-000000000001',(date_trunc('month',now())-interval '2 months'+interval '15 days')::date,25,23,2,'fresh-start');
insert into public.student_ambassador_counts(school_id,month,interested,oriented,active)
values('20000000-0000-4000-8000-000000000003',(date_trunc('month',now())-interval '2 months')::date,20,15,10);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',true);
select public.student_publish_completed_period((date_trunc('month',now())-interval '2 months')::date,'20000000-0000-4000-8000-000000000003');
reset role;
do $$ declare r jsonb; begin
 select report into r from public.student_school_reports where school_id='20000000-0000-4000-8000-000000000003';
 if r->>'cohort'<>'40–49' or r->'topics'->>'tests'<>'20–29' then raise exception 'Topic cohort calculation incorrect';end if;
 if r->'belonging'->'welcome'->>'positive'<>'20–29' then raise exception 'Belonging calculation incorrect';end if;
 if r->'belonging'->'trusted_adult'->>'positive' is not null then raise exception 'Small complement disclosed';end if;
 if r->'attendance'->>'rate'<>'90–99' or (r->'resets'->>'fresh-start')::int<>1 then raise exception 'Teacher source aggregation incorrect';end if;
 if r->'ambassadors'->>'active'<>'10–19' then raise exception 'Ambassador aggregation incorrect';end if;
 if r::text like '%Synthetic aggregate student%' then raise exception 'Student name disclosed in report';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',true);
select public.student_operator_overview();
select public.student_authorize_school('20000000-0000-4000-8000-000000000001','Synthetic school authorization',true,true,true,true,true);
select public.student_publish_completed_period((date_trunc('month',now())-interval '2 months')::date,'20000000-0000-4000-8000-000000000001');
reset role;
insert into public.student_staff_memberships(user_id,school_id,role) values('10000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000002','teacher');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000012',true);
do $$ begin
 if exists(select 1 from public.student_classrooms) or exists(select 1 from public.student_class_records) then raise exception 'Other school teacher sees class records';end if;
 begin perform public.student_save_class_record('70000000-0000-4000-8000-000000000001',(now() at time zone 'UTC')::date,25,25,0,null);raise exception 'Teacher writes other class';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Revoked student cannot request a privileged role either.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.student_apply_staff('Student spoof','Synthetic school','school_staff');raise exception 'Student can apply for staff';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Activate only the synthetic student's existing enrollment for opt-in checks.
update public.student_pilot_memberships set status='active' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.student_save_topics(array['tests','sleep'],true,'topics-pilot-2026-10-29-v1');
do $$ begin
 if (select count(*) from public.student_topic_choices)<>2 then raise exception 'Topic choices missing';end if;
 begin perform public.student_save_topics(array['tests'],false,'topics-pilot-2026-10-29-v1');raise exception 'No-ack topic sharing accepted';exception when raise_exception then if sqlerrm='No-ack topic sharing accepted' then raise;end if;end;
end $$;
select public.student_save_topics(array[]::text[],false,'');
do $$ begin if exists(select 1 from public.student_topic_choices) then raise exception 'Topic withdrawal failed';end if;end $$;
reset role;
update public.student_staff_memberships set active=false where user_id='10000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
do $$ begin
 if exists(select 1 from public.student_classrooms) then raise exception 'Revoked teacher sees classes';end if;
 begin perform public.student_create_class('Revoked');raise exception 'Revoked teacher writes';exception when insufficient_privilege then null;end;
end $$;
reset role;
