-- Included within the disposable integration transaction; every fixture rolls back.
insert into auth.users(id) values
('10000000-0000-4000-8000-000000000006'),
('10000000-0000-4000-8000-000000000007');
insert into public.student_staff_memberships(user_id,school_id,role) values
('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','therapist'),
('10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','school_staff');
do $$ begin
  if student_admin_private.count_band(9,40) is not null
    or student_admin_private.count_band(31,40) is not null
    or student_admin_private.count_band(10,19) is not null
    or student_admin_private.count_band(10,20)<>'10–19' then raise exception 'Small-cell protection failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
do $$ declare v_rows jsonb; begin
  v_rows:=public.student_therapist_requests();
  if jsonb_array_length(v_rows->'requests')<>1 then raise exception 'Therapist request scope failed'; end if;
  if (v_rows->'requests'->0) ? 'user_id' or (v_rows->'requests'->0) ? 'recipient_email' then raise exception 'Private fields disclosed'; end if;
  if exists(select 1 from public.student_goals) or exists(select 1 from public.student_messages) or exists(select 1 from public.student_check_ins) then raise exception 'Therapist sees private activity'; end if;
  perform public.student_update_followup('50000000-0000-4000-8000-000000000001','acknowledged');
  perform public.student_save_counselor_email('synthetic-counselor@example.test');
  begin
    perform public.student_update_followup('50000000-0000-4000-8000-000000000099','closed');
    raise exception 'Out-of-scope request changed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.student_followup_audit;
    raise exception 'Therapist edits audit';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.student_followup_audit)<>1 then raise exception 'Follow-up audit missing'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
do $$ begin
  if public.student_staff_reporting_status() then raise exception 'Reporting auto-approved'; end if;
  if exists(select 1 from public.student_counselor_settings) then raise exception 'School staff sees destination'; end if;
  if exists(select 1 from public.student_school_reports) then raise exception 'Unapproved report shown'; end if;
  begin
    perform public.student_therapist_requests(); raise exception 'School staff sees requests';
  exception when insufficient_privilege then null; end;
  begin
    perform public.student_save_counselor_email('forged@example.test'); raise exception 'School staff changes email';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.student_reporting_approvals values('20000000-0000-4000-8000-000000000001',now(),'self-approval');
    raise exception 'School staff self-approves reports';
  exception when insufficient_privilege then null; end;
  begin
    perform public.student_publish_school_report('20000000-0000-4000-8000-000000000001','2026-09-01');
    raise exception 'School staff publishes reports';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.student_reporting_approvals values('20000000-0000-4000-8000-000000000001',now(),'Synthetic test only');
set local role service_role;
select public.student_publish_school_report('20000000-0000-4000-8000-000000000001','2026-09-01');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
do $$ begin
  if (select count(*) from public.student_school_reports)<>1 then raise exception 'Approved school report unavailable'; end if;
  if (select report->>'status' from public.student_school_reports)<>'suppressed' then raise exception 'Small school not suppressed'; end if;
end $$;
reset role;
update public.student_staff_memberships set active=false where user_id='10000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
do $$ begin
  begin
    perform public.student_therapist_requests(); raise exception 'Revoked therapist retains access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
