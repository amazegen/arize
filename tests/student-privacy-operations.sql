-- Included in the disposable rollback transaction only. No live records.
alter table public.student_profiles add column synthetic_internal_note text default 'do not export';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare r uuid; e uuid; page jsonb; section text; begin
 r:=public.student_request_privacy('access');
 if public.student_request_privacy('access')<>r then raise exception 'Open privacy request not idempotent'; end if;
 if jsonb_array_length(public.student_privacy_self()->'requests')<>1 then raise exception 'Own requests missing'; end if;
 e:=public.student_start_export();
 perform set_config('test.export',e::text,true);
 foreach section in array array['profile','enrollment','checkIns','goals','conversations','messages','counselorRequests','belonging','topics','coachUsage','aiRequests','privacyRequests','enrollmentHistory'] loop
  page:=public.student_export_page(e,section,'');
  if jsonb_typeof(page)<>'array' then raise exception 'Invalid export %',section; end if;
  if page::text like '%recipient_email%' or page::text like '%provider_message_id%' or page::text like '%fingerprint%' or page::text like '%synthetic_internal_note%' then raise exception 'Internal export field leaked'; end if;
 end loop;
 begin perform public.student_export_page(e,'auth.users',''); raise exception 'Arbitrary export section accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.student_privacy_queue(); raise exception 'Student can list other privacy cases'; exception when insufficient_privilege then null; end;
 begin perform public.student_operator_audit(); raise exception 'Student can list audit events'; exception when insufficient_privilege then null; end;
 begin perform public.student_review_privacy(r,'closed','forged'); raise exception 'Student can review own case'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Add enough records to exercise a boundary without changing real data.
insert into public.student_privacy_requests(user_id,kind,created_at)
 select '10000000-0000-4000-8000-000000000002','correction',now()-i*interval '1 minute' from generate_series(1,55)i;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.aal','aal2',true);
do $$ declare a jsonb; b jsonb; r uuid; begin
 a:=public.student_privacy_queue();
 if jsonb_array_length(a)<>51 then raise exception 'Queue boundary incorrect'; end if;
 b:=public.student_privacy_queue((a->49->>'created_at')::timestamptz,(a->49->>'id')::uuid);
 if jsonb_array_length(b)<>6 then raise exception 'Cursor skipped or duplicated cases'; end if;
 r:=(a->0->>'id')::uuid;
 perform public.student_review_privacy(r,'in_review','SYNTHETIC-CASE-1');
 if public.student_operator_audit(null,null,'privacy')->0->>'event'<>'Privacy case: in_review' then raise exception 'Review audit absent'; end if;
 if public.student_operator_audit()::text like '%new_email%' or public.student_operator_audit()::text like '%review_reference%' or public.student_operator_audit()::text like '%Synthetic student question%' then raise exception 'Private audit details leaked'; end if;
 perform public.student_operator_directory('applications');
 perform public.student_operator_directory('staff');
 perform public.student_operator_directory('reports');
 begin perform public.student_school_calendar('20000000-0000-4000-8000-000000000001','America/New_York'); raise exception 'Enrolled school calendar changed'; exception when object_not_in_prerequisite_state then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',true);
do $$ begin
 begin perform public.student_start_export(); raise exception 'Operator can export without student enrollment'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.student_export_page(current_setting('test.export')::uuid,'messages',''); raise exception 'Other account export allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.student_schools(id,name) values('20000000-0000-4000-8000-000000000004','Synthetic calendar only');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select public.student_school_calendar('20000000-0000-4000-8000-000000000004','America/New_York');
do $$ begin
 if public.student_operator_calendars()::text not like '%America/New_York%' then raise exception 'Calendar not saved'; end if;
 begin perform public.student_school_calendar('20000000-0000-4000-8000-000000000004','not/a/timezone'); raise exception 'Bad timezone accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.student_staff_memberships set active=true where user_id='10000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
do $$ declare rows jsonb; begin
 rows:=public.student_teacher_records();
 if jsonb_array_length(rows)<1 then raise exception 'Own teacher records absent'; end if;
 if public.student_calendar_state()->>'timeZone'<>'UTC' then raise exception 'Teacher calendar incorrect'; end if;
 begin perform public.student_operator_directory('staff'); raise exception 'Teacher directory access'; exception when insufficient_privilege then null; end;
 begin perform public.student_school_calendar('20000000-0000-4000-8000-000000000004','UTC'); raise exception 'Teacher calendar change'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_tables where schemaname='public' and tablename like 'student_%' and not rowsecurity) then raise exception 'Missing RLS'; end if;
 if has_table_privilege('authenticated','public.student_privacy_requests','SELECT') or has_table_privilege('authenticated','public.student_privacy_audit','SELECT') then raise exception 'Privacy direct grants widened'; end if;
 if has_function_privilege('anon','public.student_operator_audit(timestamptz,uuid,text)','EXECUTE') or has_function_privilege('anon','public.student_export_page(uuid,text,text)','EXECUTE') then raise exception 'Anonymous RPC access'; end if;
end $$;
-- Exercise the replaced timezone-aware writers and publisher, not only compilation.
insert into auth.users(id,email) values('b0000000-0000-4000-8000-000000000001','calendar-student@example.test');
insert into public.student_pilot_memberships(user_id,school_id,status,consent_verified_at) values('b0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','active',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select public.student_authorize_school('20000000-0000-4000-8000-000000000004','Synthetic calendar approval',true,true,true,true,true);
select public.student_publish_completed_period((date_trunc('month',now())-interval '1 month')::date,'20000000-0000-4000-8000-000000000004');
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',true);
insert into public.student_profiles(user_id,display_name,grade,notice_version) values(auth.uid(),'Synthetic calendar student','10','student-pilot-2026-10-29-v4');
select public.student_save_topics(array['sleep'],true,'topics-pilot-2026-10-29-v1');
select public.student_save_belonging(4::smallint,null::smallint,4::smallint,'en',true,'belonging-pilot-2026-10-29-v2');
do $$ begin
 if public.student_calendar_state()->>'timeZone'<>'America/New_York' then raise exception 'Student calendar missing'; end if;
 if not exists(select 1 from public.student_belonging_pulses where week_of=date_trunc('week',now() at time zone 'America/New_York')::date) then raise exception 'Belonging week not school-local'; end if;
 if not exists(select 1 from public.student_topic_choices where week_of=date_trunc('week',now() at time zone 'America/New_York')::date) then raise exception 'Topic week not school-local'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.student_school_reports where school_id='20000000-0000-4000-8000-000000000004' and report->>'timeZone'='America/New_York' and report->>'status'='suppressed') then raise exception 'Calendar report lost privacy suppression or timezone'; end if;
end $$;
