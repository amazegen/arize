-- Serialize publication with attendance edits, then keep published sources frozen.
alter function public.student_publish_completed_period(date,uuid) set schema student_admin_private;
revoke all on function student_admin_private.student_publish_completed_period(date,uuid) from public,anon,authenticated;
create function public.student_publish_completed_period(p_month date,p_school uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid:=student_admin_private.staff_school('school_staff');
begin
 if student_admin_private.is_operator() then s:=p_school; end if;
 if s is null or (p_school is not null and p_school<>s) then raise exception 'School report permission required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s::text||p_month::text,2));
 perform student_admin_private.student_publish_completed_period(p_month,p_school);
end $$;
revoke all on function public.student_publish_completed_period(date,uuid) from public,anon;
grant execute on function public.student_publish_completed_period(date,uuid) to authenticated;

create function student_admin_private.freeze_attendance_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare s uuid; m date;
begin
 if tg_op in ('UPDATE','DELETE') then
  select school_id into s from public.student_classrooms where id=old.classroom_id;
  m:=date_trunc('month',old.day)::date;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s::text||m::text,2));
  if exists(select 1 from public.student_school_reports where school_id=s and month=m) then raise exception 'Published attendance period is frozen; request an audited report correction' using errcode='55000'; end if;
 end if;
 if tg_op in ('INSERT','UPDATE') then
  select school_id into s from public.student_classrooms where id=new.classroom_id;
  m:=date_trunc('month',new.day)::date;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s::text||m::text,2));
  if exists(select 1 from public.student_school_reports where school_id=s and month=m) then raise exception 'Published attendance period is frozen; request an audited report correction' using errcode='55000'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function student_admin_private.freeze_attendance_source() from public,anon,authenticated;
create trigger student_class_records_frozen before insert or update or delete on public.student_class_records for each row execute function student_admin_private.freeze_attendance_source();
