-- Run ONLY in a fresh disposable local PostgreSQL database. Uses synthetic IDs.
-- psql -v ON_ERROR_STOP=1 -f tests/student-rls.sql
begin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
\ir ../supabase/migrations/20261026154409_student_edition_pilot.sql
\ir ../supabase/migrations/20261026164541_student_counselor_requests.sql
\ir ../supabase/migrations/20261026171229_student_counselor_admin_settings.sql
insert into auth.users(id) values('10000000-0000-4000-8000-000000000009');
insert into public.student_goals(id,user_id,day,title,is_complete)
  values('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009','2026-10-26','Legacy completed goal',true);
\ir ../supabase/migrations/20261026192934_student_feature_carryover.sql
\ir ../supabase/migrations/20261028171209_student_belonging_pulse.sql
do $$ begin
  if not exists(select 1 from public.student_goals where id='30000000-0000-4000-8000-000000000009'
    and deadline='2026-10-26' and week_of='2026-10-25' and is_complete and progress=100)
    then raise exception 'Migration did not preserve a pre-existing completed goal'; end if;
end $$;
delete from auth.users where id='10000000-0000-4000-8000-000000000009';

insert into auth.users(id) values
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002'),
('10000000-0000-4000-8000-000000000003'),
('10000000-0000-4000-8000-000000000004'),
('10000000-0000-4000-8000-000000000005');
insert into public.student_schools(id,name) values('20000000-0000-4000-8000-000000000001','Synthetic school');
insert into public.student_schools(id,name) values('20000000-0000-4000-8000-000000000002','Other school');
insert into public.student_notification_admins(user_id,school_id) values
('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002');
insert into public.student_pilot_memberships(user_id,school_id,status,consent_verified_at) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active',now()),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','active',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.student_profiles(user_id,display_name,grade,notice_version) values(auth.uid(),'Student A','10','test');
select public.student_save_belonging(1::smallint,null::smallint,5::smallint,'es');
select public.student_save_belonging(2::smallint,3::smallint,4::smallint,'en');
do $$ begin
  if (select count(*) from public.student_belonging_pulses) != 1 then raise exception 'Weekly belonging response duplicated'; end if;
  if (select welcome from public.student_belonging_pulses) != 2 then raise exception 'Belonging response not updated'; end if;
  begin
    insert into public.student_belonging_pulses(user_id,welcome,language,notice_version) values(auth.uid(),1,'en','belonging-pilot-2026-10-28');
    raise exception 'Student bypasses controlled survey write';
  exception when insufficient_privilege then null; end;
  begin
    perform public.student_save_belonging(6::smallint,null::smallint,null::smallint,'en');
    raise exception 'Out-of-range survey accepted';
  exception when check_violation then null; end;
end $$;
select public.student_create_counselor_request('50000000-0000-4000-8000-000000000001');
-- The same request is idempotent, and a new one cannot spam the counselor.
select public.student_create_counselor_request('50000000-0000-4000-8000-000000000001');
do $$ begin
  if (select count(*) from public.student_counselor_requests) != 1 then raise exception 'Duplicate counselor request'; end if;
  begin
    update public.student_counselor_requests set status='sent';
    raise exception 'Student can fake notification status';
  exception when insufficient_privilege then null; end;
  begin
    perform public.student_create_counselor_request('50000000-0000-4000-8000-000000000002');
    raise exception 'Counselor request cooldown bypassed';
  exception when no_data_found then null; end;
end $$;
insert into public.student_goals(id,user_id,day,title,is_complete) values
('30000000-0000-4000-8000-000000000001',auth.uid(),current_date,'Already done',true);
insert into public.student_goals(user_id,day,title) values(auth.uid(),current_date,'A new goal');
update public.student_profiles set username='student_a' where user_id=auth.uid();
update public.student_goals set category='School',notes='Private synthetic notes',deadline=current_date
  where id='30000000-0000-4000-8000-000000000001';
update public.student_goals set archived_at=now() where id='30000000-0000-4000-8000-000000000001';
update public.student_goals set archived_at=null where id='30000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.student_goals where is_complete) != 1 then raise exception 'Adding a goal reset completion'; end if;
  if (select week_of from public.student_goals where id='30000000-0000-4000-8000-000000000001') != current_date-extract(dow from current_date)::integer then raise exception 'Generated goal week incorrect'; end if;
  if (select notes from public.student_goals where id='30000000-0000-4000-8000-000000000001') != 'Private synthetic notes' then raise exception 'Goal notes not saved'; end if;
  begin
    update public.student_goals set category='Deliverable';
    raise exception 'Invalid goal category accepted';
  exception when check_violation then null; end;
  begin
    update public.student_goals set deadline=current_date+8;
    raise exception 'Cross-week deadline accepted';
  exception when check_violation then null; end;
  begin
    update public.student_pilot_memberships set status='active' where user_id=auth.uid();
    raise exception 'Student can change enrollment';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.student_goals(user_id,day,title) values('10000000-0000-4000-8000-000000000002',current_date,'Forged');
    raise exception 'Student can forge another user';
  exception when insufficient_privilege then null; end;
end $$;
select public.student_reserve_coach_turn('40000000-0000-4000-8000-000000000001','Synthetic message') where false;
select public.student_reserve_coach_turn(null,'Synthetic message');
do $$ begin
  if not exists(select 1 from public.student_conversations where title='Synthetic message') then raise exception 'Conversation title not derived from first saved message'; end if;
  begin
    perform public.student_save_coach_reply(auth.uid(),gen_random_uuid(),'Forged assistant');
    raise exception 'Student can forge assistant replies';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from public.student_belonging_pulses) then raise exception 'Student B sees private belonging'; end if;
  if exists(select 1 from public.student_goals) then raise exception 'Student B can see Student A goals'; end if;
  update public.student_goals set archived_at=now() where id='30000000-0000-4000-8000-000000000001';
  if found then raise exception 'Student B can archive Student A goal'; end if;
  begin
    insert into public.student_profiles(user_id,display_name,grade,notice_version,username) values(auth.uid(),'Student B','11','test','student_a');
    raise exception 'Duplicate student username accepted';
  exception when unique_violation then null; end;
  if exists(select 1 from public.student_messages) then raise exception 'Student B can see Student A messages'; end if;
  if exists(select 1 from public.student_profiles) then raise exception 'Student B can see Student A profile'; end if;
  if exists(select 1 from public.student_counselor_requests) then raise exception 'Student B can see Student A counselor request'; end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
  if public.is_active_student() then raise exception 'Non-member has student access'; end if;
  if exists(select 1 from public.student_schools) then raise exception 'Non-member can see school configuration'; end if;
  begin
    insert into public.student_profiles(user_id,display_name,grade,notice_version) values(auth.uid(),'Unenrolled','10','test');
    raise exception 'Non-member can create student data';
  exception when insufficient_privilege then null; end;
end $$;

-- Student cannot acquire the staff role or change the delivery destination.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  begin
    perform public.student_save_counselor_email('forged@example.test');
    raise exception 'Student can change counselor destination';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.student_notification_admins(user_id,school_id) values(auth.uid(),'20000000-0000-4000-8000-000000000001');
    raise exception 'Student can self-grant staff role';
  exception when insufficient_privilege then null; end;
  begin
    perform recipient_email from public.student_counselor_requests;
    raise exception 'Student can read private recipient snapshot';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
update public.student_counselor_requests set recipient_email='original@example.test' where id='50000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select public.student_save_counselor_email(' FIRST@example.test ');
select public.student_save_counselor_email('updated@example.test');
select public.student_save_counselor_email('updated@example.test');
do $$ begin
  if (select recipient_email from public.student_counselor_settings) != 'updated@example.test' then raise exception 'Admin setting not saved'; end if;
  if (select count(*) from public.student_counselor_email_audit) != 2 then raise exception 'Audit duplicates or missing changes'; end if;
  if exists(select 1 from public.student_counselor_email_audit where changed_by != auth.uid()) then raise exception 'Audit actor incorrect'; end if;
  if exists(select 1 from public.student_profiles) or exists(select 1 from public.student_messages) or exists(select 1 from public.student_belonging_pulses) then raise exception 'Notification role grants private student data'; end if;
  begin
    update public.student_counselor_email_audit set new_email='fake@example.test';
    raise exception 'Admin can forge change history';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
do $$ begin
  if exists(select 1 from public.student_counselor_settings) or exists(select 1 from public.student_counselor_email_audit) then raise exception 'Cross-school admin leak'; end if;
  begin
    insert into public.student_counselor_settings(school_id,recipient_email) values('20000000-0000-4000-8000-000000000001','cross-school@example.test');
    raise exception 'Admin can edit another school';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
  if (select recipient_email from public.student_counselor_requests where id='50000000-0000-4000-8000-000000000001') != 'original@example.test' then raise exception 'Saved change redirects pending request'; end if;
end $$;
update public.student_notification_admins set active=false where user_id='10000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$ begin
  if exists(select 1 from public.student_counselor_settings) then raise exception 'Revoked admin retains access'; end if;
  begin
    perform public.student_save_counselor_email('revoked@example.test');
    raise exception 'Revoked admin can save';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists(select 1 from public.student_counselor_settings) or exists(select 1 from public.student_counselor_email_audit) then raise exception 'Student can read counselor email settings'; end if;
end $$;

reset role;
update public.student_pilot_memberships set status='revoked' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists(select 1 from public.student_goals) then raise exception 'Revoked student can read old data'; end if;
  if exists(select 1 from public.student_belonging_pulses) then raise exception 'Revoked student can read survey data'; end if;
  begin
    perform public.student_save_belonging(1::smallint,null::smallint,null::smallint,'en');
    raise exception 'Revoked student can write survey';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.student_messages) then raise exception 'Revoked student can read chats'; end if;
  if exists(select 1 from public.student_counselor_requests) then raise exception 'Revoked student can read counselor requests'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.student_profiles;
    raise exception 'Anonymous access to student data';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'Student RLS integration assertions passed (transaction rolled back).'
