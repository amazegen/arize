-- Student pilot data is deliberately separate from the adult app's tables.
-- Apply to a dedicated STUDENT preview backend first, not production.
create table public.student_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  counselor_url text check (counselor_url is null or counselor_url ~ '^https://'),
  counselor_instructions text not null default 'Ask a teacher or the school office how to reach your counselor.',
  created_at timestamptz not null default now()
);

create table public.student_pilot_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.student_schools(id),
  role text not null default 'student' check (role = 'student'),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  -- Set only by the pilot administrator after school/guardian consent review.
  consent_verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index student_memberships_school on public.student_pilot_memberships(school_id);

create function public.is_active_student() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.student_pilot_memberships
    where user_id = (select auth.uid()) and role = 'student'
      and status = 'active' and consent_verified_at is not null);
$$;
revoke all on function public.is_active_student() from public, anon;
grant execute on function public.is_active_student() to authenticated;

create table public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  grade text not null check (grade in ('9','10','11','12')),
  notice_version text not null,
  acknowledged_at timestamptz not null default now()
);
create table public.student_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create table public.student_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  title text not null check (char_length(title) between 1 and 160),
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);
create index student_goals_user_day on public.student_goals(user_id, day, created_at);

create table public.student_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Clarity conversation',
  created_at timestamptz not null default now(),
  unique(id, user_id)
);
create index student_conversations_user on public.student_conversations(user_id, created_at desc);
create table public.student_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.student_conversations(id, user_id) on delete cascade
);
create index student_messages_conversation on public.student_messages(conversation_id, created_at);
create table public.student_coach_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  minute_start timestamptz not null default now(),
  minute_count integer not null default 0,
  primary key (user_id, day)
);

alter table public.student_schools enable row level security;
alter table public.student_pilot_memberships enable row level security;
alter table public.student_profiles enable row level security;
alter table public.student_check_ins enable row level security;
alter table public.student_goals enable row level security;
alter table public.student_conversations enable row level security;
alter table public.student_messages enable row level security;
alter table public.student_coach_usage enable row level security;

revoke all on public.student_schools, public.student_pilot_memberships,
  public.student_profiles, public.student_check_ins, public.student_goals,
  public.student_conversations, public.student_messages, public.student_coach_usage from anon, authenticated;

grant select on public.student_schools, public.student_pilot_memberships to authenticated;
create policy student_enrollment_self_read on public.student_pilot_memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy student_school_self_read on public.student_schools for select to authenticated using (
  (select public.is_active_student()) and id in (
    select school_id from public.student_pilot_memberships where user_id = (select auth.uid())
  )
);

grant select, insert, update on public.student_profiles, public.student_check_ins, public.student_goals to authenticated;
create policy student_profile_owner on public.student_profiles for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
create policy student_check_in_owner on public.student_check_ins for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
create policy student_goal_owner on public.student_goals for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));

-- Messages can only be written by the guarded, rate-limited server function below.
grant select on public.student_conversations, public.student_messages to authenticated;
create policy student_conversation_read on public.student_conversations for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_student()));
create policy student_message_read on public.student_messages for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_student()));

create function public.student_reserve_coach_turn(p_conversation_id uuid, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid := p_conversation_id;
  v_usage public.student_coach_usage;
begin
  if v_user is null or not public.is_active_student() then raise exception 'Student access required'; end if;
  if char_length(trim(p_content)) not between 1 and 2000 then raise exception 'Invalid message'; end if;
  -- Serialize turns per student: no per-instance/in-memory quota bypass.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  insert into public.student_coach_usage(user_id, day) values(v_user, current_date) on conflict do nothing;
  select * into v_usage from public.student_coach_usage where user_id = v_user and day = current_date for update;
  if v_usage.count >= 30 or (v_usage.minute_start > now() - interval '1 minute' and v_usage.minute_count >= 5) then
    raise exception 'Student message limit reached' using errcode = 'P0002';
  end if;
  if v_id is null then
    insert into public.student_conversations(user_id) values(v_user) returning id into v_id;
  elsif not exists(select 1 from public.student_conversations where id = v_id and user_id = v_user) then
    raise exception 'Conversation not found';
  end if;
  update public.student_coach_usage set count = count + 1,
    minute_count = case when minute_start <= now() - interval '1 minute' then 1 else minute_count + 1 end,
    minute_start = case when minute_start <= now() - interval '1 minute' then now() else minute_start end
    where user_id = v_user and day = current_date;
  insert into public.student_messages(conversation_id, user_id, role, content) values(v_id, v_user, 'user', trim(p_content));
  return v_id;
end;
$$;
revoke all on function public.student_reserve_coach_turn(uuid, text) from public, anon;
grant execute on function public.student_reserve_coach_turn(uuid, text) to authenticated;

-- The server supplies the assistant response; students cannot forge assistant messages.
create function public.student_save_coach_reply(p_user_id uuid, p_conversation_id uuid, p_content text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.student_pilot_memberships where user_id = p_user_id
    and status = 'active' and consent_verified_at is not null) then raise exception 'Student access required'; end if;
  insert into public.student_messages(conversation_id, user_id, role, content)
    values(p_conversation_id, p_user_id, 'assistant', p_content);
end;
$$;
revoke all on function public.student_save_coach_reply(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.student_save_coach_reply(uuid, uuid, text) to service_role;
