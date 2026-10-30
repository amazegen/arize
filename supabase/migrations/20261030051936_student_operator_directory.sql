create function public.student_operator_directory(p_section text,p_before text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d timestamptz; i uuid;
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if p_before is not null then
  if char_length(p_before)>150 or array_length(string_to_array(p_before,'|'),1)<>2 then raise exception 'Invalid cursor' using errcode='22023'; end if;
  d:=split_part(p_before,'|',1)::timestamptz;i:=split_part(p_before,'|',2)::uuid;
 end if;
 if p_section='applications' then
  return (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select a.user_id,a.display_name,a.school_name,a.requested_role,a.submitted_at,u.email,
   to_char(a.submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z|'||a.user_id::text as cursor
   from public.student_staff_applications a join auth.users u on u.id=a.user_id
   where a.status='pending' and(d is null or(a.submitted_at,a.user_id)<(d,i)) order by a.submitted_at desc,a.user_id desc limit 51)q);
 elsif p_section='staff' then
  return(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select m.user_id,m.role,s.name school_name,a.display_name,u.email,
   to_char(m.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z|'||m.user_id::text as cursor
   from public.student_staff_memberships m join public.student_schools s on s.id=m.school_id join auth.users u on u.id=m.user_id
   left join public.student_staff_applications a on a.user_id=m.user_id where m.active and(d is null or(m.created_at,m.user_id)<(d,i))
   order by m.created_at desc,m.user_id desc limit 51)q);
 elsif p_section='reports' then
  return(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select r.school_id as "schoolId",s.name as "schoolName",r.month,r.report,r.published_at,
   r.month::text||'T00:00:00Z|'||r.school_id::text as cursor from public.student_school_reports r join public.student_schools s on s.id=r.school_id
   where student_admin_private.reporting_allowed(r.school_id) and(d is null or(r.month,r.school_id)<((d at time zone 'UTC')::date,i)) order by r.month desc,r.school_id desc limit 51)q);
 else raise exception 'Invalid directory section' using errcode='22023';end if;
end $$;
revoke all on function public.student_operator_directory(text,text) from public,anon;
grant execute on function public.student_operator_directory(text,text) to authenticated;
create index student_staff_directory on public.student_staff_memberships(created_at desc,user_id desc) where active;
create index student_application_directory on public.student_staff_applications(submitted_at desc,user_id desc) where status='pending';

create function public.student_operator_audit(p_before timestamptz default null,p_before_id uuid default null,p_source text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if p_source is not null and p_source not in ('staff','scope','enrollment','notification','privacy') then raise exception 'Invalid audit source' using errcode='22023'; end if;
 return(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(
  select * from(
   select id,'staff'::text source,changed_at at,changed_by actor_id,school_id,user_id subject_id,action||' '||role event from public.student_staff_access_audit
   union all select id,'scope',changed_at,changed_by,school_id,null::uuid,'School collection/reporting scope reviewed' from public.student_scope_audit
   union all select id,'enrollment',created_at,operator_id,school_id,student_id,'Enrollment: '||status from public.student_enrollment_audit
   union all select id,'notification',changed_at,changed_by,school_id,null::uuid,'Counselor destination updated (address withheld)' from public.student_counselor_email_audit
   union all select a.id,'privacy',a.created_at,a.actor_id,null::uuid,r.user_id,'Privacy case: '||a.status from public.student_privacy_audit a join public.student_privacy_requests r on r.id=a.request_id
  )v where (p_source is null or source=p_source) and(p_before is null or(at,id)<(p_before,p_before_id)) order by at desc,id desc limit 51
 )q);
end $$;
revoke all on function public.student_operator_audit(timestamptz,uuid,text) from public,anon;
grant execute on function public.student_operator_audit(timestamptz,uuid,text) to authenticated;
