create table public.student_counselor_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.student_schools(id),
  display_name text not null check(char_length(display_name) between 1 and 50),
  status text not null default 'pending' check(status in ('pending','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text
);
create index student_counselor_requests_owner on public.student_counselor_requests(user_id, created_at desc);
alter table public.student_counselor_requests enable row level security;
revoke all on public.student_counselor_requests from public, anon, authenticated;
grant select(id, user_id, school_id, display_name, status, created_at, sent_at) on public.student_counselor_requests to authenticated;
grant select, update on public.student_counselor_requests to service_role;
create policy student_counselor_request_self_read on public.student_counselor_requests for select to authenticated
  using(user_id = (select auth.uid()) and (select public.is_active_student()));

-- Students cannot mark a request sent, choose recipients, or attach chat data.
-- Privileged creation is required to atomically enforce ownership and cooldown.
create function public.student_create_counselor_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_request public.student_counselor_requests;
  v_name text;
  v_school uuid;
begin
  if v_user is null or not public.is_active_student() then
    raise exception 'Student access required' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'Request ID required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':counselor', 0));
  select * into v_request from public.student_counselor_requests where id = p_request_id and user_id = v_user;
  if found then return pg_catalog.jsonb_build_object('id',v_request.id,'status',v_request.status,'created_at',v_request.created_at,'display_name',v_request.display_name); end if;
  if exists(select 1 from public.student_counselor_requests where user_id=v_user and created_at > now() - interval '2 minutes') then
    raise exception 'Please wait before sending another request' using errcode = 'P0002';
  end if;
  select display_name into v_name from public.student_profiles where user_id=v_user;
  select school_id into v_school from public.student_pilot_memberships where user_id=v_user;
  if v_name is null or v_school is null then raise exception 'Student onboarding required'; end if;
  insert into public.student_counselor_requests(id,user_id,school_id,display_name)
    values(p_request_id,v_user,v_school,v_name) returning * into v_request;
  return pg_catalog.jsonb_build_object('id',v_request.id,'status',v_request.status,'created_at',v_request.created_at,'display_name',v_request.display_name);
end;
$$;
revoke all on function public.student_create_counselor_request(uuid) from public, anon;
grant execute on function public.student_create_counselor_request(uuid) to authenticated;
