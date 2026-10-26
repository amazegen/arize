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

insert into auth.users(id) values
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002'),
('10000000-0000-4000-8000-000000000003');
insert into public.student_schools(id,name) values('20000000-0000-4000-8000-000000000001','Synthetic school');
insert into public.student_pilot_memberships(user_id,school_id,status,consent_verified_at) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active',now()),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','active',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.student_profiles(user_id,display_name,grade,notice_version) values(auth.uid(),'Student A','10','test');
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
do $$ begin
  if (select count(*) from public.student_goals where is_complete) != 1 then raise exception 'Adding a goal reset completion'; end if;
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
  begin
    perform public.student_save_coach_reply(auth.uid(),gen_random_uuid(),'Forged assistant');
    raise exception 'Student can forge assistant replies';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from public.student_goals) then raise exception 'Student B can see Student A goals'; end if;
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

reset role;
update public.student_pilot_memberships set status='revoked' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists(select 1 from public.student_goals) then raise exception 'Revoked student can read old data'; end if;
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
