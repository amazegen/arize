-- Real operational sources. No role, school, approval or sample record is seeded.
alter table public.student_profiles add column reporting_ack_at timestamptz;
create function student_admin_private.stamp_reporting_notice() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.notice_version='student-pilot-2026-10-29-v4' then
  if tg_op='UPDATE' and old.notice_version='student-pilot-2026-10-29-v4' then new.reporting_ack_at:=old.reporting_ack_at;
  else new.reporting_ack_at:=now(); end if;
 else new.reporting_ack_at:=null; end if;
 return new;
end $$;
revoke all on function student_admin_private.stamp_reporting_notice() from public,anon,authenticated;
create trigger student_reporting_notice_stamp before insert or update on public.student_profiles
 for each row execute function student_admin_private.stamp_reporting_notice();
alter table public.student_staff_memberships drop constraint student_staff_memberships_role_check;
alter table public.student_staff_memberships add constraint student_staff_memberships_role_check
  check(role in ('therapist','school_staff','teacher'));
create table public.student_operators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true
);
alter table public.student_operators enable row level security;
revoke all on public.student_operators from public,anon,authenticated;
grant select on public.student_operators to authenticated;
grant select,insert,update,delete on public.student_operators to service_role;
create policy student_operator_self on public.student_operators for select to authenticated
 using(user_id=(select auth.uid()) and active);
create function student_admin_private.is_operator() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_operators where user_id=(select auth.uid()) and active);
$$;
revoke all on function student_admin_private.is_operator() from public,anon;
grant execute on function student_admin_private.is_operator() to authenticated;

create table public.student_staff_applications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 1 and 80),
 school_name text not null check(char_length(school_name) between 2 and 160),
 requested_role text not null check(requested_role in ('therapist','school_staff','teacher')),
 status text not null default 'pending' check(status in ('pending','approved','declined')),
 submitted_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null
);
create index student_pending_staff_apps on public.student_staff_applications(submitted_at) where status='pending';
alter table public.student_staff_applications enable row level security;
revoke all on public.student_staff_applications from public,anon,authenticated;
grant select on public.student_staff_applications to authenticated;
grant select,delete on public.student_staff_applications to service_role;
create policy student_application_self on public.student_staff_applications for select to authenticated
 using(user_id=(select auth.uid()));
create function public.student_apply_staff(p_name text,p_school text,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if exists(select 1 from public.student_pilot_memberships where user_id=(select auth.uid())) then raise exception 'Use a separate verified adult staff account' using errcode='42501'; end if;
 if exists(select 1 from public.student_staff_memberships where user_id=(select auth.uid()) and active)
  then raise exception 'Account already has staff access'; end if;
 if exists(select 1 from public.student_staff_applications where user_id=(select auth.uid()) and status='approved') then raise exception 'Contact the operator to restore or change reviewed access'; end if;
 insert into public.student_staff_applications(user_id,display_name,school_name,requested_role)
 values((select auth.uid()),trim(p_name),trim(p_school),p_role)
 on conflict(user_id) do update set display_name=excluded.display_name,school_name=excluded.school_name,
 requested_role=excluded.requested_role,status='pending',submitted_at=now(),reviewed_at=null,reviewed_by=null
 where student_staff_applications.status='declined';
end $$;
revoke all on function public.student_apply_staff(text,text,text) from public,anon;
grant execute on function public.student_apply_staff(text,text,text) to authenticated;

create table public.student_school_features (
 school_id uuid primary key references public.student_schools(id) on delete cascade,
 attendance boolean not null default false,
 topics boolean not null default false,
 belonging boolean not null default false,
 ambassadors boolean not null default false,
 review_reference text not null,
 approved_at timestamptz not null default now(),
 approved_by uuid references auth.users(id) on delete set null
);
alter table public.student_school_features enable row level security;
revoke all on public.student_school_features from public,anon,authenticated;
grant select on public.student_school_features to service_role;

create function public.student_operator_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 return jsonb_build_object(
  'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope',jsonb_build_object('attendance',coalesce(f.attendance,false),'topics',coalesce(f.topics,false),'belonging',coalesce(f.belonging,false),'ambassadors',coalesce(f.ambassadors,false),'reporting',student_admin_private.reporting_allowed(s.id)),'reference',f.review_reference) order by s.name),'[]') from public.student_schools s left join public.student_school_features f on f.school_id=s.id),
  'applications',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (
   select a.user_id,a.display_name,a.school_name,a.requested_role,a.status,a.submitted_at,u.email
   from public.student_staff_applications a join auth.users u on u.id=a.user_id
   where a.status='pending' order by a.submitted_at limit 50)q),
  'staff',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (
    select m.user_id,m.role,s.name school_name,a.display_name,u.email from public.student_staff_memberships m
    join public.student_schools s on s.id=m.school_id join auth.users u on u.id=m.user_id
    left join public.student_staff_applications a on a.user_id=m.user_id where m.active order by m.created_at desc limit 100)q),
  'reports',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (
   select r.school_id as "schoolId",s.name as "schoolName",r.month,r.published_at,r.report from public.student_school_reports r
   join public.student_schools s on s.id=r.school_id where student_admin_private.reporting_allowed(r.school_id)
   order by r.month desc,r.school_id limit 60)q),
  'kpis',jsonb_build_object('schools',(select count(*) from public.student_schools),
   'approved_students',(select count(*) from public.student_pilot_memberships where status='active' and consent_verified_at is not null),
   'approved_staff',(select count(*) from public.student_staff_memberships where active),
   'published_reports',(select count(*) from public.student_school_reports)));
end $$;
revoke all on function public.student_operator_overview() from public,anon;
grant execute on function public.student_operator_overview() to authenticated;

create table public.student_staff_access_audit (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 school_id uuid references public.student_schools(id) on delete cascade,
 role text not null,action text not null,
 changed_by uuid references auth.users(id) on delete set null,changed_at timestamptz not null default now()
);
alter table public.student_staff_access_audit enable row level security;
revoke all on public.student_staff_access_audit from public,anon,authenticated;
create function public.student_review_staff(p_user uuid,p_school uuid,p_approve boolean,p_verified boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a public.student_staff_applications; v_school uuid:=p_school;
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 select * into a from public.student_staff_applications where user_id=p_user and status='pending' for update;
 if not found then raise exception 'Pending application not found'; end if;
 if p_approve then
  if exists(select 1 from public.student_pilot_memberships where user_id=p_user) then raise exception 'Student accounts cannot be promoted to staff' using errcode='42501'; end if;
  if p_verified is distinct from true then raise exception 'Verify identity and school authority first'; end if;
  if v_school is null then
   if a.requested_role<>'school_staff' then raise exception 'Choose a verified existing school'; end if;
   insert into public.student_schools(name) values(a.school_name) returning id into v_school;
  end if;
  if not exists(select 1 from public.student_schools where id=v_school) then raise exception 'School not found'; end if;
  insert into public.student_staff_memberships(user_id,school_id,role,active) values(p_user,v_school,a.requested_role,true)
  on conflict(user_id) do update set school_id=excluded.school_id,role=excluded.role,active=true;
 end if;
 update public.student_staff_applications set status=case when p_approve then 'approved' else 'declined' end,
  reviewed_at=now(),reviewed_by=(select auth.uid()) where user_id=p_user;
 insert into public.student_staff_access_audit(user_id,school_id,role,action,changed_by)
 values(p_user,v_school,a.requested_role,case when p_approve then 'approved' else 'declined' end,(select auth.uid()));
end $$;
revoke all on function public.student_review_staff(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.student_review_staff(uuid,uuid,boolean,boolean) to authenticated;

create function public.student_revoke_staff(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.student_staff_memberships;
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 update public.student_staff_memberships set active=false where user_id=p_user and active returning * into m;
 if not found then return; end if;
 insert into public.student_staff_access_audit(user_id,school_id,role,action,changed_by) values(m.user_id,m.school_id,m.role,'revoked',(select auth.uid()));
end $$;
revoke all on function public.student_revoke_staff(uuid) from public,anon;
grant execute on function public.student_revoke_staff(uuid) to authenticated;

create table public.student_scope_audit (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.student_schools(id) on delete cascade,
 scope jsonb not null,review_reference text not null,changed_by uuid references auth.users(id) on delete set null,changed_at timestamptz not null default now()
);
alter table public.student_scope_audit enable row level security;
revoke all on public.student_scope_audit from public,anon,authenticated;
create function public.student_authorize_school(p_school uuid,p_reference text,p_attendance boolean,p_topics boolean,p_belonging boolean,p_ambassadors boolean,p_reporting boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if p_reference is null or char_length(trim(p_reference)) not between 3 and 200 then raise exception 'School authorization reference required'; end if;
 insert into public.student_school_features(school_id,attendance,topics,belonging,ambassadors,review_reference,approved_by)
 values(p_school,p_attendance,p_topics,p_belonging,p_ambassadors,trim(p_reference),(select auth.uid()))
 on conflict(school_id) do update set attendance=excluded.attendance,topics=excluded.topics,belonging=excluded.belonging,ambassadors=excluded.ambassadors,
 review_reference=excluded.review_reference,approved_at=now(),approved_by=excluded.approved_by;
 if p_reporting then
  insert into public.student_reporting_approvals(school_id,approved_at,review_reference) values(p_school,now(),trim(p_reference))
  on conflict(school_id) do update set approved_at=excluded.approved_at,review_reference=excluded.review_reference;
 else delete from public.student_reporting_approvals where school_id=p_school; end if;
 insert into public.student_scope_audit(school_id,scope,review_reference,changed_by) values(p_school,
 jsonb_build_object('attendance',p_attendance,'topics',p_topics,'belonging',p_belonging,'ambassadors',p_ambassadors,'reporting',p_reporting),trim(p_reference),(select auth.uid()));
end $$;
revoke all on function public.student_authorize_school(uuid,text,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.student_authorize_school(uuid,text,boolean,boolean,boolean,boolean,boolean) to authenticated;

create policy student_teacher_school_read on public.student_schools for select to authenticated
 using(id=student_admin_private.staff_school('teacher'));
create table public.student_classrooms (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.student_schools(id) on delete cascade,
 teacher_id uuid not null references auth.users(id) on delete cascade,
 label text not null check(char_length(label) between 1 and 80),created_at timestamptz not null default now(),
 unique(teacher_id,label)
);
create index student_classrooms_school on public.student_classrooms(school_id);
create table public.student_class_records (
 classroom_id uuid not null references public.student_classrooms(id) on delete cascade,
 day date not null,enrolled integer not null check(enrolled between 1 and 500),
 present integer not null check(present>=0),absent integer not null check(absent>=0),
 reset_lesson text check(reset_lesson in ('fresh-start','before-a-test','connection')),
 updated_at timestamptz not null default now(),
 primary key(classroom_id,day),check(present+absent=enrolled)
);
-- One class/day attendance record; editing replaces it rather than double-counting.
alter table public.student_classrooms enable row level security;
alter table public.student_class_records enable row level security;
revoke all on public.student_classrooms,public.student_class_records from public,anon,authenticated;
grant select on public.student_classrooms,public.student_class_records to authenticated;
create policy teacher_own_classes on public.student_classrooms for select to authenticated
 using(teacher_id=(select auth.uid()) and school_id=student_admin_private.staff_school('teacher'));
create policy teacher_own_records on public.student_class_records for select to authenticated
 using(exists(select 1 from public.student_classrooms c where c.id=classroom_id and c.teacher_id=(select auth.uid()) and c.school_id=student_admin_private.staff_school('teacher')));
create function public.student_create_class(p_label text) returns uuid
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('teacher'); v uuid;
begin
 if s is null then raise exception 'Teacher access required' using errcode='42501'; end if;
 insert into public.student_classrooms(school_id,teacher_id,label) values(s,(select auth.uid()),trim(p_label))
 on conflict(teacher_id,label) do update set label=excluded.label returning id into v;
 return v;
end $$;
revoke all on function public.student_create_class(text) from public,anon;
grant execute on function public.student_create_class(text) to authenticated;
create function public.student_save_class_record(p_class uuid,p_day date,p_enrolled integer,p_present integer,p_absent integer,p_lesson text) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('teacher');
begin
 if s is null or not exists(select 1 from public.student_classrooms where id=p_class and teacher_id=(select auth.uid()) and school_id=s)
  then raise exception 'Assigned teacher required' using errcode='42501'; end if;
 if not exists(select 1 from public.student_school_features where school_id=s and attendance) then raise exception 'School attendance authorization required' using errcode='42501'; end if;
 if p_day is null or p_day>(now() at time zone 'UTC')::date or p_day<(now() at time zone 'UTC')::date-31 then raise exception 'Choose today or the last 31 days'; end if;
 insert into public.student_class_records(classroom_id,day,enrolled,present,absent,reset_lesson)
 values(p_class,p_day,p_enrolled,p_present,p_absent,p_lesson)
 on conflict(classroom_id,day) do update set enrolled=excluded.enrolled,present=excluded.present,absent=excluded.absent,
 reset_lesson=excluded.reset_lesson,updated_at=now();
end $$;
revoke all on function public.student_save_class_record(uuid,date,integer,integer,integer,text) from public,anon;
grant execute on function public.student_save_class_record(uuid,date,integer,integer,integer,text) to authenticated;

create table public.student_topic_choices (
 user_id uuid not null references auth.users(id) on delete cascade,
 week_of date not null default(date_trunc('week',now() at time zone 'UTC')::date),
 topic text not null check(topic in ('tests','future','social','relationships','identity','sleep','responsibilities','grief')),
 notice_version text not null default 'topics-pilot-2026-10-29-v1' check(notice_version='topics-pilot-2026-10-29-v1'),
 recorded_at timestamptz not null default now(),
 primary key(user_id,week_of,topic)
);
alter table public.student_topic_choices enable row level security;
revoke all on public.student_topic_choices from public,anon,authenticated;
grant select on public.student_topic_choices to authenticated;
create policy student_topic_self on public.student_topic_choices for select to authenticated
 using(user_id=(select auth.uid()) and (select public.is_active_student()));
create function public.student_save_topics(p_topics text[],p_acknowledged boolean,p_notice text) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid; w date:=date_trunc('week',now() at time zone 'UTC')::date;
begin
 if not public.is_active_student() then raise exception 'Student access required' using errcode='42501'; end if;
 select school_id into s from public.student_pilot_memberships where user_id=(select auth.uid());
 if p_topics is null or cardinality(p_topics)>8 then raise exception 'Choose up to eight topics'; end if;
 if cardinality(p_topics)>0 then
  if not exists(select 1 from public.student_school_features where school_id=s and topics) then raise exception 'Topic collection not approved' using errcode='42501'; end if;
  if p_acknowledged is distinct from true or p_notice is distinct from 'topics-pilot-2026-10-29-v1' then raise exception 'Topic-sharing acknowledgement required'; end if;
  if not exists(select 1 from public.student_profiles where user_id=(select auth.uid()) and notice_version='student-pilot-2026-10-29-v4') then raise exception 'Complete current onboarding first' using errcode='42501'; end if;
 end if;
 -- Serialize weekly replacement; empty array revokes the student's selections.
 perform 1 from public.student_pilot_memberships where user_id=(select auth.uid()) for update;
 delete from public.student_topic_choices where user_id=(select auth.uid()) and week_of=w;
 insert into public.student_topic_choices(user_id,week_of,topic) select (select auth.uid()),w,t from (select distinct unnest(p_topics) t)q;
end $$;
revoke all on function public.student_save_topics(text[],boolean,text) from public,anon;
grant execute on function public.student_save_topics(text[],boolean,text) to authenticated;

create table public.student_ambassador_counts (
 school_id uuid not null references public.student_schools(id) on delete cascade,
 month date not null check(month=date_trunc('month',month)::date),
 interested integer not null check(interested between 0 and 10000),
 oriented integer not null check(oriented between 0 and interested),
 active integer not null check(active between 0 and oriented),
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null,
 primary key(school_id,month)
);
alter table public.student_ambassador_counts enable row level security;
revoke all on public.student_ambassador_counts from public,anon,authenticated;
grant select on public.student_ambassador_counts to authenticated;
create policy school_ambassador_counts_read on public.student_ambassador_counts for select to authenticated
 using(school_id=student_admin_private.staff_school('school_staff'));
create function public.student_save_ambassador_counts(p_month date,p_interested integer,p_oriented integer,p_active integer) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('school_staff');
begin
 if s is null or not exists(select 1 from public.student_school_features where school_id=s and ambassadors)
  then raise exception 'School program authorization required' using errcode='42501'; end if;
 if p_month is null or p_month>date_trunc('month',now() at time zone 'UTC')::date
  or p_month<date_trunc('month',now() at time zone 'UTC')::date-interval '12 months' then raise exception 'Choose a current or recent month'; end if;
 if exists(select 1 from public.student_school_reports where school_id=s and month=p_month) then raise exception 'Published period is frozen'; end if;
 insert into public.student_ambassador_counts(school_id,month,interested,oriented,active,updated_by)
 values(s,p_month,p_interested,p_oriented,p_active,(select auth.uid()))
 on conflict(school_id,month) do update set interested=excluded.interested,oriented=excluded.oriented,active=excluded.active,updated_at=now(),updated_by=excluded.updated_by;
end $$;
revoke all on function public.student_save_ambassador_counts(date,integer,integer,integer) from public,anon;
grant execute on function public.student_save_ambassador_counts(date,integer,integer,integer) to authenticated;

create function public.student_operations_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.student_staff_memberships; f public.student_school_features;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into m from public.student_staff_memberships where user_id=(select auth.uid()) and active;
 select * into f from public.student_school_features where school_id=m.school_id;
 return jsonb_build_object('operator',student_admin_private.is_operator(),
  'role',m.role,'schoolId',m.school_id,'schoolName',(select name from public.student_schools where id=m.school_id),
  'application',(select jsonb_build_object('display_name',display_name,'school_name',school_name,'requested_role',requested_role,'status',status) from public.student_staff_applications where user_id=(select auth.uid())),
  'features',jsonb_build_object('attendance',coalesce(f.attendance,false),'topics',coalesce(f.topics,false),'ambassadors',coalesce(f.ambassadors,false)),
  'classes',case when m.role='teacher' then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label)),'[]') from public.student_classrooms where teacher_id=(select auth.uid()) and school_id=m.school_id) else '[]'::jsonb end,
  'records',case when m.role='teacher' then (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select r.classroom_id,r.day,r.enrolled,r.present,r.absent,r.reset_lesson from public.student_class_records r join public.student_classrooms c on c.id=r.classroom_id where c.teacher_id=(select auth.uid()) and c.school_id=m.school_id order by r.day desc limit 100)q) else '[]'::jsonb end);
end $$;
revoke all on function public.student_operations_state() from public,anon;
grant execute on function public.student_operations_state() to authenticated;

create function public.student_publish_completed_period(p_month date,p_school uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('school_staff'); e date; cohort bigint;
 topic_data jsonb; belonging_data jsonb; attendance_data jsonb; reset_data jsonb; ambassador_data jsonb;
 total_sessions bigint; present_sessions bigint; attendance_rows bigint; n integer; o integer; a integer;
 checkin_count bigint;goal_count bigint;chat_count bigint;
begin
 if student_admin_private.is_operator() then s:=p_school; end if;
 if s is null or (p_school is not null and p_school<>s) then raise exception 'School report permission required' using errcode='42501'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month>=date_trunc('month',now() at time zone 'UTC')::date
 or p_month<date_trunc('month',now() at time zone 'UTC')::date-interval '12 months' then raise exception 'Choose a completed month within the last year'; end if;
 if not student_admin_private.reporting_allowed(s) then raise exception 'School reporting approval required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||p_month::text,0));
 if exists(select 1 from public.student_school_reports where school_id=s and month=p_month) then return; end if;
 e:=(p_month+interval '1 month')::date;
 select count(*) into cohort from public.student_pilot_memberships m join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone 'UTC') and p.notice_version='student-pilot-2026-10-29-v4' and p.reporting_ack_at<(e::timestamp at time zone 'UTC');
 select count(distinct c.user_id) into checkin_count from public.student_check_ins c join public.student_pilot_memberships m on m.user_id=c.user_id join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone 'UTC') and p.notice_version='student-pilot-2026-10-29-v4' and c.day>=p.reporting_ack_at::date and c.day>=p_month and c.day<e;
 select count(distinct c.user_id) into goal_count from public.student_goals c join public.student_pilot_memberships m on m.user_id=c.user_id join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone 'UTC') and p.notice_version='student-pilot-2026-10-29-v4' and c.created_at>=p.reporting_ack_at and c.created_at>=(p_month::timestamp at time zone 'UTC') and c.created_at<(e::timestamp at time zone 'UTC');
 select count(distinct c.user_id) into chat_count from public.student_conversations c join public.student_pilot_memberships m on m.user_id=c.user_id join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone 'UTC') and p.notice_version='student-pilot-2026-10-29-v4' and c.created_at>=p.reporting_ack_at and c.created_at>=(p_month::timestamp at time zone 'UTC') and c.created_at<(e::timestamp at time zone 'UTC');
 select jsonb_object_agg(topic,band) into topic_data from (
  select t.topic,student_admin_private.count_band(count(distinct t.user_id),cohort) band
  from public.student_topic_choices t join public.student_pilot_memberships m on m.user_id=t.user_id
  where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone 'UTC') and exists(select 1 from public.student_profiles p where p.user_id=m.user_id and p.notice_version='student-pilot-2026-10-29-v4' and p.reporting_ack_at<(e::timestamp at time zone 'UTC')) and t.recorded_at>=(p_month::timestamp at time zone 'UTC') and t.recorded_at<(e::timestamp at time zone 'UTC') group by t.topic)q;
 with latest as (
  select distinct on(b.user_id) b.user_id,b.welcome,b.trusted_adult,b.connection from public.student_belonging_pulses b
  join public.student_pilot_memberships m on m.user_id=b.user_id
  where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone 'UTC')
  and exists(select 1 from public.student_profiles p where p.user_id=m.user_id and p.notice_version='student-pilot-2026-10-29-v4' and p.reporting_ack_at<(e::timestamp at time zone 'UTC')) and b.acknowledged_at>=(p_month::timestamp at time zone 'UTC') and b.acknowledged_at<(e::timestamp at time zone 'UTC') and b.notice_version='belonging-pilot-2026-10-29-v2' order by b.user_id,b.acknowledged_at desc
 ), answers as (select k,v from latest cross join lateral(values('welcome',welcome),('trusted_adult',trusted_adult),('connection',connection))q(k,v))
 select jsonb_object_agg(k,jsonb_build_object('positive',student_admin_private.count_band(positive,respondents),
 'respondents',case when respondents>=20 then (respondents/10*10)::text||'–'||(respondents/10*10+9)::text else null end)) into belonging_data
 from(select k,count(v) respondents,count(*) filter(where v>=4) positive from answers group by k)q;
 select count(*),coalesce(sum(r.enrolled),0),coalesce(sum(r.present),0) into attendance_rows,total_sessions,present_sessions
 from public.student_class_records r join public.student_classrooms c on c.id=r.classroom_id where c.school_id=s and r.day>=p_month and r.day<e;
 attendance_data:=jsonb_build_object('rate',case when cohort>=20 and attendance_rows>0 and total_sessions>=20 then
  case when present_sessions=total_sessions then '100–100' else (floor(100.0*present_sessions/total_sessions/10)*10)::integer::text||'–'||least(99,(floor(100.0*present_sessions/total_sessions/10)*10+9)::integer)::text end else null end,
  'source','teacher-entered student-sessions; not unique students');
 select jsonb_object_agg(lesson,sessions) into reset_data from (
  select r.reset_lesson lesson,case when cohort>=20 then count(*) else null end sessions
  from public.student_class_records r join public.student_classrooms c on c.id=r.classroom_id
  where c.school_id=s and r.day>=p_month and r.day<e and r.reset_lesson is not null group by r.reset_lesson)q;
 if attendance_rows>0 and cohort>=20 then reset_data:=jsonb_build_object('fresh-start',0,'before-a-test',0,'connection',0)||coalesce(reset_data,'{}'); end if;
 select interested,oriented,active into n,o,a from public.student_ambassador_counts where school_id=s and month=p_month;
 ambassador_data:=jsonb_build_object('interested',student_admin_private.count_band(n,cohort),'oriented',student_admin_private.count_band(o,cohort),'active',student_admin_private.count_band(a,cohort));
 insert into public.student_school_reports(school_id,month,report) values(s,p_month,jsonb_build_object(
 'cohort',case when cohort>=20 then (cohort/10*10)::text||'–'||(cohort/10*10+9)::text else null end,
 'checkins',student_admin_private.count_band(checkin_count,cohort),'goals',student_admin_private.count_band(goal_count,cohort),'clarity',student_admin_private.count_band(chat_count,cohort),
 'minimumGroup',10,'status',case when cohort>=20 then 'published' else 'suppressed' end,
 'version',2,'topics',topic_data,'belonging',belonging_data,'attendance',attendance_data,'resets',reset_data,'ambassadors',ambassador_data)) on conflict do nothing;
end $$;
revoke all on function public.student_publish_completed_period(date,uuid) from public,anon;
grant execute on function public.student_publish_completed_period(date,uuid) to authenticated;

create function public.student_feature_enabled(p_feature text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s uuid; f public.student_school_features;
begin
 if not public.is_active_student() then return false; end if;
 select school_id into s from public.student_pilot_memberships where user_id=(select auth.uid());
 select * into f from public.student_school_features where school_id=s;
 return coalesce(case p_feature when 'topics' then f.topics when 'belonging' then f.belonging else false end,false);
end $$;
revoke all on function public.student_feature_enabled(text) from public,anon;
grant execute on function public.student_feature_enabled(text) to authenticated;

alter table public.student_belonging_pulses drop constraint student_belonging_pulses_notice_version_check;
alter table public.student_belonging_pulses add constraint student_belonging_pulses_notice_version_check
 check(notice_version in ('belonging-pilot-2026-10-28','belonging-pilot-2026-10-29-v2'));
drop function public.student_save_belonging(smallint,smallint,smallint,text);
create function public.student_save_belonging(p_welcome smallint,p_trusted_adult smallint,p_connection smallint,p_language text,p_acknowledged boolean,p_notice text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.student_feature_enabled('belonging') then raise exception 'School belonging approval required' using errcode='42501'; end if;
 if p_acknowledged is distinct from true or p_notice is distinct from 'belonging-pilot-2026-10-29-v2' then raise exception 'Current survey acknowledgement required'; end if;
 if not exists(select 1 from public.student_profiles where user_id=(select auth.uid()) and notice_version='student-pilot-2026-10-29-v4') then raise exception 'Current onboarding required' using errcode='42501'; end if;
 insert into public.student_belonging_pulses(user_id,welcome,trusted_adult,connection,language,notice_version)
 values((select auth.uid()),p_welcome,p_trusted_adult,p_connection,p_language,'belonging-pilot-2026-10-29-v2')
 on conflict(user_id,week_of) do update set welcome=excluded.welcome,trusted_adult=excluded.trusted_adult,
 connection=excluded.connection,language=excluded.language,notice_version=excluded.notice_version,acknowledged_at=now();
end $$;
revoke all on function public.student_save_belonging(smallint,smallint,smallint,text,boolean,text) from public,anon;
grant execute on function public.student_save_belonging(smallint,smallint,smallint,text,boolean,text) to authenticated;
