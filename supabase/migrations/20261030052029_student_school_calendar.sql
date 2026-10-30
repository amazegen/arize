alter table public.student_schools add column time_zone text not null default 'UTC';
create function public.student_school_calendar(p_school uuid,p_zone text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if p_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Choose an IANA timezone' using errcode='22023'; end if;
 perform 1 from public.student_schools where id=p_school for update;
 if not found then raise exception 'School not found' using errcode='22023'; end if;
 if exists(select 1 from public.student_pilot_memberships where school_id=p_school) or exists(select 1 from public.student_school_reports where school_id=p_school)
 or exists(select 1 from public.student_classrooms c where c.school_id=p_school)
 then raise exception 'Calendar is frozen after enrollment, class setup or recorded activity' using errcode='55000'; end if;
 update public.student_schools set time_zone=p_zone where id=p_school;
 insert into public.student_scope_audit(school_id,scope,review_reference,changed_by) values(p_school,jsonb_build_object('timeZone',p_zone),'School calendar configuration before enrollment',(select auth.uid()));
end $$;
revoke all on function public.student_school_calendar(uuid,text) from public,anon;
grant execute on function public.student_school_calendar(uuid,text) to authenticated;
-- Expose calendar metadata without rewriting the existing state/overview contract.
create function public.student_calendar_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s uuid; z text;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select school_id into s from public.student_staff_memberships where user_id=(select auth.uid()) and active and student_admin_private.staff_assurance();
 if s is null then select school_id into s from public.student_pilot_memberships where user_id=(select auth.uid()); end if;
 select time_zone into z from public.student_schools where id=s;
 return jsonb_build_object('timeZone',coalesce(z,'UTC'),'today',to_char(now() at time zone coalesce(z,'UTC'),'YYYY-MM-DD'));
end $$;
revoke all on function public.student_calendar_state() from public,anon;
grant execute on function public.student_calendar_state() to authenticated;
create function public.student_operator_calendars() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'timeZone',s.time_zone,'frozen',
 exists(select 1 from public.student_pilot_memberships where school_id=s.id) or exists(select 1 from public.student_school_reports where school_id=s.id)
 or exists(select 1 from public.student_classrooms c where c.school_id=s.id)) order by s.name),'[]') from public.student_schools s);
end $$;
revoke all on function public.student_operator_calendars() from public,anon;
grant execute on function public.student_operator_calendars() to authenticated;

create function public.student_teacher_records(p_before date default null,p_before_class uuid default null,p_day date default null,p_class uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('teacher');
begin
 if s is null then raise exception 'Teacher access required' using errcode='42501'; end if;
 return(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select r.classroom_id,r.day,r.enrolled,r.present,r.absent,r.reset_lesson
  from public.student_class_records r join public.student_classrooms c on c.id=r.classroom_id
  where c.school_id=s and c.teacher_id=(select auth.uid()) and (p_before is null or(r.day,r.classroom_id)<(p_before,p_before_class))
  and(p_day is null or r.day=p_day) and(p_class is null or r.classroom_id=p_class)
  order by r.day desc,r.classroom_id desc limit 51)q);
end $$;
revoke all on function public.student_teacher_records(date,uuid,date,uuid) from public,anon;
grant execute on function public.student_teacher_records(date,uuid,date,uuid) to authenticated;
create or replace function student_admin_private.student_publish_completed_period(p_month date,p_school uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('school_staff'); e date; cohort bigint;
 topic_data jsonb; belonging_data jsonb; attendance_data jsonb; reset_data jsonb; ambassador_data jsonb;
 total_sessions bigint; present_sessions bigint; attendance_rows bigint; n integer; o integer; a integer;
 checkin_count bigint;goal_count bigint;chat_count bigint;tz text;
begin
 if student_admin_private.is_operator() then s:=p_school; end if;
 if s is null or (p_school is not null and p_school<>s) then raise exception 'School report permission required' using errcode='42501'; end if;
 select time_zone into tz from public.student_schools where id=s;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month>=date_trunc('month',now() at time zone tz)::date
 or p_month<date_trunc('month',now() at time zone tz)::date-interval '12 months' then raise exception 'Choose a completed month within the last year'; end if;
 if not student_admin_private.reporting_allowed(s) then raise exception 'School reporting approval required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||p_month::text,0));
 if exists(select 1 from public.student_school_reports where school_id=s and month=p_month) then return; end if;
 e:=(p_month+interval '1 month')::date;
 select count(*) into cohort from public.student_pilot_memberships m join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone tz) and p.notice_version='student-pilot-2026-10-29-v4' and p.reporting_ack_at<(e::timestamp at time zone tz);
 select count(distinct c.user_id) into checkin_count from public.student_check_ins c join public.student_pilot_memberships m on m.user_id=c.user_id join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone tz) and p.notice_version='student-pilot-2026-10-29-v4' and c.day>=(p.reporting_ack_at at time zone tz)::date and c.day>=p_month and c.day<e;
 select count(distinct c.user_id) into goal_count from public.student_goals c join public.student_pilot_memberships m on m.user_id=c.user_id join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone tz) and p.notice_version='student-pilot-2026-10-29-v4' and c.created_at>=p.reporting_ack_at and c.created_at>=(p_month::timestamp at time zone tz) and c.created_at<(e::timestamp at time zone tz);
 select count(distinct c.user_id) into chat_count from public.student_conversations c join public.student_pilot_memberships m on m.user_id=c.user_id join public.student_profiles p on p.user_id=m.user_id
 where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone tz) and p.notice_version='student-pilot-2026-10-29-v4' and c.created_at>=p.reporting_ack_at and c.created_at>=(p_month::timestamp at time zone tz) and c.created_at<(e::timestamp at time zone tz);
 select jsonb_object_agg(topic,band) into topic_data from (
  select t.topic,student_admin_private.count_band(count(distinct t.user_id),cohort) band
  from public.student_topic_choices t join public.student_pilot_memberships m on m.user_id=t.user_id
  where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone tz) and exists(select 1 from public.student_profiles p where p.user_id=m.user_id and p.notice_version='student-pilot-2026-10-29-v4' and p.reporting_ack_at<(e::timestamp at time zone tz)) and t.recorded_at>=(p_month::timestamp at time zone tz) and t.recorded_at<(e::timestamp at time zone tz) group by t.topic)q;
 with latest as (
  select distinct on(b.user_id) b.user_id,b.welcome,b.trusted_adult,b.connection from public.student_belonging_pulses b
  join public.student_pilot_memberships m on m.user_id=b.user_id
  where m.school_id=s and m.status='active' and m.consent_verified_at is not null and m.created_at<(e::timestamp at time zone tz)
  and exists(select 1 from public.student_profiles p where p.user_id=m.user_id and p.notice_version='student-pilot-2026-10-29-v4' and p.reporting_ack_at<(e::timestamp at time zone tz)) and b.acknowledged_at>=(p_month::timestamp at time zone tz) and b.acknowledged_at<(e::timestamp at time zone tz) and b.notice_version='belonging-pilot-2026-10-29-v2' order by b.user_id,b.acknowledged_at desc
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
 'version',2,'timeZone',tz,'topics',topic_data,'belonging',belonging_data,'attendance',attendance_data,'resets',reset_data,'ambassadors',ambassador_data)) on conflict do nothing;
end $$;
create or replace function public.student_save_class_record(p_class uuid,p_day date,p_enrolled integer,p_present integer,p_absent integer,p_lesson text) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('teacher');tz text;
begin
 if s is null or not exists(select 1 from public.student_classrooms where id=p_class and teacher_id=(select auth.uid()) and school_id=s)
  then raise exception 'Assigned teacher required' using errcode='42501'; end if;
 if not exists(select 1 from public.student_school_features where school_id=s and attendance) then raise exception 'School attendance authorization required' using errcode='42501'; end if;
 select time_zone into tz from public.student_schools where id=s;
 if p_day is null or p_day>(now() at time zone tz)::date or p_day<(now() at time zone tz)::date-31 then raise exception 'Choose today or the last 31 days'; end if;
 insert into public.student_class_records(classroom_id,day,enrolled,present,absent,reset_lesson)
 values(p_class,p_day,p_enrolled,p_present,p_absent,p_lesson)
 on conflict(classroom_id,day) do update set enrolled=excluded.enrolled,present=excluded.present,absent=excluded.absent,
 reset_lesson=excluded.reset_lesson,updated_at=now();
end $$;
create or replace function public.student_save_topics(p_topics text[],p_acknowledged boolean,p_notice text) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid; w date;tz text;
begin
 if not public.is_active_student() then raise exception 'Student access required' using errcode='42501'; end if;
 select m.school_id,school.time_zone into s,tz from public.student_pilot_memberships m join public.student_schools school on school.id=m.school_id where m.user_id=(select auth.uid());
 w:=date_trunc('week',now() at time zone tz)::date;
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
create or replace function public.student_save_belonging(p_welcome smallint,p_trusted_adult smallint,p_connection smallint,p_language text,p_acknowledged boolean,p_notice text)
returns void language plpgsql security definer set search_path='' as $$
declare tz text; w date;
begin
 if not public.student_feature_enabled('belonging') then raise exception 'School belonging approval required' using errcode='42501'; end if;
 if p_acknowledged is distinct from true or p_notice is distinct from 'belonging-pilot-2026-10-29-v2' then raise exception 'Current survey acknowledgement required'; end if;
 if not exists(select 1 from public.student_profiles where user_id=(select auth.uid()) and notice_version='student-pilot-2026-10-29-v4') then raise exception 'Current onboarding required' using errcode='42501'; end if;
 select s.time_zone into tz from public.student_schools s join public.student_pilot_memberships m on m.school_id=s.id where m.user_id=(select auth.uid());
 w:=date_trunc('week',now() at time zone tz)::date;
 insert into public.student_belonging_pulses(user_id,week_of,welcome,trusted_adult,connection,language,notice_version)
 values((select auth.uid()),w,p_welcome,p_trusted_adult,p_connection,p_language,'belonging-pilot-2026-10-29-v2')
 on conflict(user_id,week_of) do update set welcome=excluded.welcome,trusted_adult=excluded.trusted_adult,
 connection=excluded.connection,language=excluded.language,notice_version=excluded.notice_version,acknowledged_at=now();
end $$;
create or replace function public.student_save_ambassador_counts(p_month date,p_interested integer,p_oriented integer,p_active integer) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('school_staff');tz text;
begin
 if s is null or not exists(select 1 from public.student_school_features where school_id=s and ambassadors)
  then raise exception 'School program authorization required' using errcode='42501'; end if;
 select time_zone into tz from public.student_schools where id=s;
 if p_month is null or p_month>date_trunc('month',now() at time zone tz)::date
  or p_month<date_trunc('month',now() at time zone tz)::date-interval '12 months' then raise exception 'Choose a current or recent month'; end if;
 if exists(select 1 from public.student_school_reports where school_id=s and month=p_month) then raise exception 'Published period is frozen'; end if;
 insert into public.student_ambassador_counts(school_id,month,interested,oriented,active,updated_by)
 values(s,p_month,p_interested,p_oriented,p_active,(select auth.uid()))
 on conflict(school_id,month) do update set interested=excluded.interested,oriented=excluded.oriented,active=excluded.active,updated_at=now(),updated_by=excluded.updated_by;
end $$;
