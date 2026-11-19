-- Non-destructive forward correction of the existing RPC. No data, roles or RLS policies
-- change. Staff MFA remains opt-in; verified factors require an AAL2 session.
-- Keep the existing response contract, including pending-applicant onboarding.
create or replace function public.student_operations_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.student_staff_memberships; f public.student_school_features;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
 -- A direct RPC bypasses the application's assurance check, and this definer
 -- bypasses table RLS. Check assurance before reading any protected state.
 if student_admin_private.staff_assurance() is distinct from true then
  raise exception 'Verify your second factor before accessing staff data' using errcode='42501';
 end if;
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
