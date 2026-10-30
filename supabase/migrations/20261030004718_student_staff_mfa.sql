-- Opt-in rollout: existing accounts keep access until they verify a factor.
-- Once enrolled, AAL1 sessions cannot read/write privileged school data directly.
create function student_admin_private.staff_assurance() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select auth.jwt()->>'aal')='aal2',false)
 or not exists(select 1 from auth.mfa_factors where user_id=(select auth.uid()) and status='verified');
$$;
revoke all on function student_admin_private.staff_assurance() from public,anon;
grant execute on function student_admin_private.staff_assurance() to authenticated;
create or replace function student_admin_private.is_operator() returns boolean
language sql stable security definer set search_path='' as $$
 select student_admin_private.staff_assurance() and exists(select 1 from public.student_operators where user_id=(select auth.uid()) and active);
$$;
create or replace function student_admin_private.staff_school(p_role text) returns uuid
language sql stable security definer set search_path='' as $$
 select school_id from public.student_staff_memberships where user_id=(select auth.uid()) and active and role=p_role and student_admin_private.staff_assurance();
$$;
create or replace function student_admin_private.manages_notifications(p_school_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select student_admin_private.staff_assurance() and (
  p_school_id=student_admin_private.staff_school('therapist')
  or(not exists(select 1 from public.student_staff_memberships where user_id=(select auth.uid()) and active)
   and exists(select 1 from public.student_notification_admins where user_id=(select auth.uid()) and school_id=p_school_id and active)));
$$;
