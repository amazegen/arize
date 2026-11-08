-- Student Edition only. Backward-compatible default: a counselor's primary
-- school remains active unless an explicitly assigned school is requested.
do $$ begin
 if to_regclass('public.student_pilot_memberships') is null then raise exception 'Student backend required';end if;
end $$;
create table public.student_counselor_assignments (
 user_id uuid not null references auth.users(id) on delete cascade,
 school_id uuid not null references public.student_schools(id) on delete cascade,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(user_id,school_id)
);
alter table public.student_counselor_assignments enable row level security;
revoke all on public.student_counselor_assignments from public,anon,authenticated;
grant select on public.student_counselor_assignments to authenticated;
grant select,insert,update,delete on public.student_counselor_assignments to service_role;
create policy counselor_assignment_self on public.student_counselor_assignments for select to authenticated
 using(user_id=(select auth.uid()) and active and (select student_admin_private.staff_assurance()) and exists(
  select 1 from public.student_staff_memberships m where m.user_id=(select auth.uid()) and m.active and m.role='therapist'
 ));
create policy counselor_assigned_school_read on public.student_schools for select to authenticated
 using(exists(select 1 from public.student_counselor_assignments a where a.school_id=id and a.user_id=(select auth.uid()) and a.active));

create or replace function student_admin_private.staff_school(p_role text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); base uuid; requested text;
begin
 if u is null or not student_admin_private.staff_assurance() then return null;end if;
 select school_id into base from public.student_staff_memberships where user_id=u and active and role=p_role;
 if base is null or p_role<>'therapist' then return base;end if;
 requested:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-arize-school';
 if requested is null then return base;end if;
 if requested !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
 if requested::uuid=base or exists(select 1 from public.student_counselor_assignments where user_id=u and school_id=requested::uuid and active)
 then return requested::uuid;end if;
 return null;
end $$;
revoke all on function student_admin_private.staff_school(text) from public,anon;
grant execute on function student_admin_private.staff_school(text) to authenticated;

create function public.student_staff_scope() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m public.student_staff_memberships; s uuid; result jsonb;
begin
 select * into m from public.student_staff_memberships where user_id=(select auth.uid()) and active;
 if not found then raise exception 'Approved staff access required' using errcode='42501';end if;
 s:=student_admin_private.staff_school(m.role);
 if s is null then raise exception 'Assigned school access required' using errcode='42501';end if;
 select jsonb_build_object('schoolId',id,'schoolName',name,'timeZone',time_zone,'schools',(
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name) order by q.name),'[]') from(
   select id,name from public.student_schools where id=m.school_id or (m.role='therapist' and id in(
    select school_id from public.student_counselor_assignments where user_id=(select auth.uid()) and active
   ))
  )q)) into result from public.student_schools where id=s;
 if result is null then raise exception 'School unavailable' using errcode='42501';end if;
 return result;
end $$;
revoke all on function public.student_staff_scope() from public,anon;
grant execute on function public.student_staff_scope() to authenticated;

alter table public.student_schools add column counselor_instructions_es text;
