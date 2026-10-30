create table public.student_enrollment_audit (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references auth.users(id) on delete cascade,
 operator_id uuid references auth.users(id) on delete set null,
 school_id uuid not null references public.student_schools(id),
 status text not null check(status in ('invited','active','revoked')),
 review_reference text not null check(char_length(review_reference) between 3 and 200),
 created_at timestamptz not null default now()
);
alter table public.student_enrollment_audit enable row level security;
revoke all on public.student_enrollment_audit from public,anon,authenticated;
create index student_enrollment_audit_student on public.student_enrollment_audit(student_id,created_at desc);

-- Exact-email lookup only; no bulk student roster or private activity is exposed.
create function public.student_find_enrollment(p_email text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid; e text; m public.student_pilot_memberships;
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if char_length(p_email) not between 3 and 254 then raise exception 'Invalid email' using errcode='22023'; end if;
 select id,email into u,e from auth.users where lower(email)=lower(trim(p_email));
 if u is null then return jsonb_build_object('found',false); end if;
 select * into m from public.student_pilot_memberships where user_id=u;
 return jsonb_build_object('found',true,'userId',u,'email',e,'status',m.status,'schoolId',m.school_id,'consentVerified',m.consent_verified_at is not null,
 'adultRole',exists(select 1 from public.student_operators where user_id=u) or exists(select 1 from public.student_staff_memberships where user_id=u) or exists(select 1 from public.student_staff_applications where user_id=u));
end $$;
revoke all on function public.student_find_enrollment(text) from public,anon;
grant execute on function public.student_find_enrollment(text) to authenticated;

create function public.student_manage_enrollment(p_user uuid,p_school uuid,p_status text,p_reference text,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare m public.student_pilot_memberships;
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if p_confirmed is distinct from true or p_status not in ('invited','active','revoked') or char_length(trim(p_reference)) not between 3 and 200 then raise exception 'Verified review reference required' using errcode='22023'; end if;
 if exists(select 1 from public.student_operators where user_id=p_user) or exists(select 1 from public.student_staff_memberships where user_id=p_user) or exists(select 1 from public.student_staff_applications where user_id=p_user) then raise exception 'Use a separate student account' using errcode='42501'; end if;
 if not exists(select 1 from public.student_schools where id=p_school) then raise exception 'School not found' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,3));
 select * into m from public.student_pilot_memberships where user_id=p_user for update;
 if m.user_id is null then
  if p_status<>'invited' then raise exception 'Invite the student first' using errcode='22023'; end if;
  insert into public.student_pilot_memberships(user_id,school_id,status) values(p_user,p_school,'invited');
 else
  if m.school_id<>p_school or p_status='invited' then raise exception 'Enrollment already exists; school transfers need a separate review' using errcode='22023'; end if;
  update public.student_pilot_memberships set status=p_status,consent_verified_at=case when p_status='active' then now() else consent_verified_at end where user_id=p_user;
 end if;
 insert into public.student_enrollment_audit(student_id,operator_id,school_id,status,review_reference) values(p_user,(select auth.uid()),p_school,p_status,trim(p_reference));
end $$;
revoke all on function public.student_manage_enrollment(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.student_manage_enrollment(uuid,uuid,text,text,boolean) to authenticated;
