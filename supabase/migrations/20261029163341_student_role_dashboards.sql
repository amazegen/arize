-- Separate role scopes; no existing student or notification admin is upgraded.
create table public.student_staff_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.student_schools(id) on delete cascade,
  role text not null check(role in ('therapist','school_staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.student_staff_memberships enable row level security;
revoke all on public.student_staff_memberships from public,anon,authenticated;
grant select on public.student_staff_memberships to authenticated;
grant select,insert,update,delete on public.student_staff_memberships to service_role;
create policy student_staff_self on public.student_staff_memberships for select to authenticated
  using(user_id=(select auth.uid()) and active);

create function student_admin_private.staff_school(p_role text) returns uuid
language sql stable security definer set search_path='' as $$
  select school_id from public.student_staff_memberships
  where user_id=(select auth.uid()) and active and role=p_role;
$$;
revoke all on function student_admin_private.staff_school(text) from public,anon;
grant execute on function student_admin_private.staff_school(text) to authenticated;

create policy student_staff_school_read on public.student_schools for select to authenticated
  using(id=student_admin_private.staff_school('therapist') or id=student_admin_private.staff_school('school_staff'));

-- Therapist permission includes the existing notification destination setting.
create or replace function student_admin_private.manages_notifications(p_school_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_school_id=student_admin_private.staff_school('therapist')
  or (not exists(select 1 from public.student_staff_memberships where user_id=(select auth.uid()) and active)
    and exists(select 1 from public.student_notification_admins
    where user_id=(select auth.uid()) and school_id=p_school_id and active)
  );
$$;

create or replace function public.student_save_counselor_email(p_email text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_school uuid; v_setting public.student_counselor_settings;
begin
  v_school:=student_admin_private.staff_school('therapist');
  if v_school is null and not exists(select 1 from public.student_staff_memberships where user_id=(select auth.uid()) and active) then
    select school_id into v_school from public.student_notification_admins
      where user_id=(select auth.uid()) and active;
  end if;
  if v_school is null then raise exception 'Counselor notification access required' using errcode='42501'; end if;
  insert into public.student_counselor_settings(school_id,recipient_email)
    values(v_school,lower(trim(p_email)))
    on conflict(school_id) do update set recipient_email=excluded.recipient_email
    returning * into v_setting;
  return pg_catalog.jsonb_build_object('email',v_setting.recipient_email,'updatedAt',v_setting.updated_at);
end $$;

create table public.student_request_followups (
  request_id uuid primary key references public.student_counselor_requests(id) on delete cascade,
  stage text not null check(stage in ('new','acknowledged','contacted','closed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table public.student_followup_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.student_counselor_requests(id) on delete cascade,
  stage text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.student_request_followups enable row level security;
alter table public.student_followup_audit enable row level security;
revoke all on public.student_request_followups,public.student_followup_audit from public,anon,authenticated;
-- Browser roles get no direct access. RPCs project only necessary fields.

create function public.student_therapist_requests(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_school uuid:=student_admin_private.staff_school('therapist'); v_rows jsonb;
begin
  if v_school is null then raise exception 'Therapist access required' using errcode='42501'; end if;
  if p_offset<0 or p_offset>10000 then raise exception 'Invalid page'; end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_rows from (
    select r.id,r.display_name,r.status as delivery_status,r.created_at,
      coalesce(f.stage,'new') as stage,f.updated_at
    from public.student_counselor_requests r
    left join public.student_request_followups f on f.request_id=r.id
    where r.school_id=v_school
    order by r.created_at desc,r.id desc limit 51 offset p_offset
  ) q;
  return jsonb_build_object('requests',v_rows);
end $$;
revoke all on function public.student_therapist_requests(integer) from public,anon;
grant execute on function public.student_therapist_requests(integer) to authenticated;

create function public.student_update_followup(p_request_id uuid,p_stage text) returns void
language plpgsql security definer set search_path='' as $$
declare v_school uuid:=student_admin_private.staff_school('therapist');
begin
  if v_school is null then raise exception 'Therapist access required' using errcode='42501'; end if;
  if p_stage not in ('new','acknowledged','contacted','closed') or p_stage is null then raise exception 'Invalid stage'; end if;
  -- Lock serializes changes and verifies scope in the same transaction.
  perform 1 from public.student_counselor_requests where id=p_request_id and school_id=v_school for update;
  if not found then raise exception 'Request not found' using errcode='42501'; end if;
  if exists(select 1 from public.student_request_followups where request_id=p_request_id and stage=p_stage) then return; end if;
  insert into public.student_request_followups(request_id,stage,updated_by)
    values(p_request_id,p_stage,(select auth.uid()))
    on conflict(request_id) do update set stage=excluded.stage,updated_by=excluded.updated_by,updated_at=now();
  insert into public.student_followup_audit(request_id,stage,changed_by)
    values(p_request_id,p_stage,(select auth.uid()));
end $$;
revoke all on function public.student_update_followup(uuid,text) from public,anon;
grant execute on function public.student_update_followup(uuid,text) to authenticated;

-- The approval is operator-set after school/privacy review, not a staff toggle.
create table public.student_reporting_approvals (
  school_id uuid primary key references public.student_schools(id) on delete cascade,
  approved_at timestamptz not null,
  review_reference text not null check(char_length(review_reference) between 1 and 200)
);
create table public.student_school_reports (
  school_id uuid not null references public.student_schools(id) on delete cascade,
  month date not null,
  report jsonb not null,
  published_at timestamptz not null default now(),
  primary key(school_id,month)
);
alter table public.student_reporting_approvals enable row level security;
alter table public.student_school_reports enable row level security;
revoke all on public.student_reporting_approvals,public.student_school_reports from public,anon,authenticated;
grant select on public.student_school_reports to authenticated;
grant select,insert,delete on public.student_reporting_approvals to service_role;
grant select,delete on public.student_school_reports to service_role;
-- Approval existence checked by a guard; direct approval records stay private.
create function student_admin_private.reporting_allowed(p_school uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.student_reporting_approvals where school_id=p_school);
$$;
revoke all on function student_admin_private.reporting_allowed(uuid) from public,anon;
grant execute on function student_admin_private.reporting_allowed(uuid) to authenticated;
create policy student_school_report_read on public.student_school_reports for select to authenticated
  using(school_id=student_admin_private.staff_school('school_staff') and student_admin_private.reporting_allowed(school_id));

create function student_admin_private.count_band(p_n bigint,p_cohort bigint) returns text
language sql immutable set search_path='' as $$
  select case when p_cohort<20 or p_n<10 or p_cohort-p_n<10 then null
    else (p_n/10*10)::text || '–' || (p_n/10*10+9)::text end;
$$;
revoke all on function student_admin_private.count_band(bigint,bigint) from public,anon,authenticated;

-- Privileged publication only: frozen, completed-calendar-month snapshots.
-- Never averages wellness scores or reads chat text, names, grades or requests.
create function public.student_publish_school_report(p_school_id uuid,p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare v_cohort bigint;v_checkins bigint;v_goals bigint;v_chat bigint;v_end date;v_start_ts timestamptz;v_end_ts timestamptz;
begin
  if p_month is null or p_month<>date_trunc('month',p_month)::date
    or p_month>=date_trunc('month',now() at time zone 'UTC')::date then raise exception 'Completed month required'; end if;
  if not student_admin_private.reporting_allowed(p_school_id) then raise exception 'School approval required'; end if;
  if exists(select 1 from public.student_school_reports where school_id=p_school_id and month=p_month) then return; end if;
  v_end:=(p_month+interval '1 month')::date;
  v_start_ts:=p_month::timestamp at time zone 'UTC';
  v_end_ts:=v_end::timestamp at time zone 'UTC';
  select count(*) into v_cohort from public.student_pilot_memberships
    where school_id=p_school_id and status='active' and consent_verified_at is not null and created_at<v_end_ts;
  select count(distinct c.user_id) into v_checkins from public.student_check_ins c
    join public.student_pilot_memberships m on m.user_id=c.user_id
    where m.school_id=p_school_id and m.status='active' and m.consent_verified_at is not null and m.created_at<v_end_ts and c.day>=p_month and c.day<v_end;
  select count(distinct g.user_id) into v_goals from public.student_goals g
    join public.student_pilot_memberships m on m.user_id=g.user_id
    where m.school_id=p_school_id and m.status='active' and m.consent_verified_at is not null and m.created_at<v_end_ts and g.created_at>=v_start_ts and g.created_at<v_end_ts;
  select count(distinct c.user_id) into v_chat from public.student_conversations c
    join public.student_pilot_memberships m on m.user_id=c.user_id
    where m.school_id=p_school_id and m.status='active' and m.consent_verified_at is not null and m.created_at<v_end_ts and c.created_at>=v_start_ts and c.created_at<v_end_ts;
  insert into public.student_school_reports(school_id,month,report) values(p_school_id,p_month,jsonb_build_object(
    'cohort',case when v_cohort>=20 then (v_cohort/10*10)::text||'–'||(v_cohort/10*10+9)::text else null end,
    'checkins',student_admin_private.count_band(v_checkins,v_cohort),
    'goals',student_admin_private.count_band(v_goals,v_cohort),
    'clarity',student_admin_private.count_band(v_chat,v_cohort),
    'minimumGroup',10,'status',case when v_cohort>=20 then 'published' else 'suppressed' end))
    on conflict do nothing;
end $$;
revoke all on function public.student_publish_school_report(uuid,date) from public,anon,authenticated;
grant execute on function public.student_publish_school_report(uuid,date) to service_role;

create function public.student_staff_reporting_status() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_school uuid:=student_admin_private.staff_school('school_staff');
begin
 if v_school is null then raise exception 'School staff access required' using errcode='42501'; end if;
 return student_admin_private.reporting_allowed(v_school);
end $$;
revoke all on function public.student_staff_reporting_status() from public,anon;
grant execute on function public.student_staff_reporting_status() to authenticated;

-- No new real staff assignment, approval, report or student record is inserted.
