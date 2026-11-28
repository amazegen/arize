-- ============================================================
-- Arize by AmazeGen — Supabase Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  username text,
  role text,
  company text,
  avatar_url text,
  streak_count int default 0,
  last_checkin_date date,
  onboarded boolean default false,
  created_at timestamptz default now()
);

-- Auto-create profile on user sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CHECK-INS
-- ============================================================
create table if not exists check_ins (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  mood text check (mood in ('tense','meh','steady','grounded','thriving')) not null,
  mood_score int check (mood_score between 1 and 5) not null,
  energy int check (energy between 0 and 10) not null,
  emotion_tags text[] default '{}',
  journal_text text,
  time_of_day text check (time_of_day in ('morning','midday','evening')) default 'morning',
  created_at timestamptz default now()
);

create index if not exists check_ins_user_id_created_at on check_ins (user_id, created_at desc);

-- ============================================================
-- GOALS
-- ============================================================
create table if not exists goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  category text check (category in ('Career','Wellness','Reflection','Personal')) default 'Personal',
  progress int check (progress between 0 and 100) default 0,
  deadline date,
  week_of date,
  is_complete boolean default false,
  notes text,
  created_at timestamptz default now()
);

create index if not exists goals_user_id_week_of on goals (user_id, week_of desc);

-- ============================================================
-- VILLAGE ROOMS
-- ============================================================
create table if not exists village_rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  is_featured boolean default false,
  created_at timestamptz default now()
);

-- Seed default rooms
insert into village_rooms (name, description, is_featured) values
  ('First Gen in Finance', 'Navigating spaces not built for you — together.', true),
  ('Manager Mode', 'Leading while being the only one in the room.', false),
  ('Navigating the Room', 'Microaggressions, politics, and staying whole.', false),
  ('Wins Only', 'Drop your wins here. Big and small. All of them count.', false)
on conflict do nothing;

-- ============================================================
-- VILLAGE MEMBERSHIPS
-- ============================================================
create table if not exists village_memberships (
  user_id uuid references profiles(id) on delete cascade not null,
  room_id uuid references village_rooms(id) on delete cascade not null,
  joined_at timestamptz default now(),
  is_moderator boolean default false,
  primary key (user_id, room_id)
);

-- ============================================================
-- VILLAGE MESSAGES
-- ============================================================
create table if not exists village_messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references village_rooms(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  message_type text check (message_type in ('text','audio','video')) default 'text',
  audio_url text,
  created_at timestamptz default now()
);

create index if not exists village_messages_room_id_created_at on village_messages (room_id, created_at asc);

-- ============================================================
-- FRIDAY REFLECTIONS (placeholder)
-- ============================================================
create table if not exists friday_reflections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  content text,
  wins text[] default '{}',
  week_of date,
  created_at timestamptz default now()
);

create index if not exists friday_reflections_user_id on friday_reflections (user_id, created_at desc);

-- ============================================================
-- COACH REQUEST QUOTAS
-- ============================================================
create table if not exists coach_requests (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now() not null
);

create index if not exists coach_requests_user_id_created_at
  on coach_requests (user_id, created_at desc);

create table if not exists coach_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists coach_conversations_user_updated_at
  on coach_conversations (user_id, updated_at desc);

create table if not exists coach_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid references coach_conversations(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text check (role in ('user','assistant')) not null,
  content text check (char_length(content) between 1 and 8000) not null,
  created_at timestamptz default now() not null
);

create index if not exists coach_messages_conversation_created_at
  on coach_messages (conversation_id, created_at asc);

create unique index if not exists profiles_username_unique
  on profiles (lower(username))
  where username is not null;

alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,30}$');

-- ============================================================
-- LEGAL CONSENT HISTORY
-- ============================================================
create table if not exists legal_consents (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz default now() not null,
  unique (user_id, terms_version, privacy_version)
);

create index if not exists legal_consents_user_accepted_at
  on legal_consents (user_id, accepted_at desc);

create or replace function public.record_legal_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  insert into public.legal_consents (user_id, terms_version, privacy_version)
  values (current_user_id, '2.0', '2.0')
  on conflict (user_id, terms_version, privacy_version) do nothing;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Profiles: users can only read/update their own
alter table profiles enable row level security;
create policy "profiles: own read" on profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: own update" on profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Legal consent: users can view their record but only the fixed function can add it.
alter table legal_consents enable row level security;
create policy "legal_consents: own read" on legal_consents for select to authenticated
  using ((select auth.uid()) = user_id);

-- Check-ins: users can only read/write their own
alter table check_ins enable row level security;
create policy "check_ins: own read" on check_ins for select to authenticated using ((select auth.uid()) = user_id);
create policy "check_ins: own insert" on check_ins for insert to authenticated with check ((select auth.uid()) = user_id);

-- Goals: users can only read/write their own
alter table goals enable row level security;
create policy "goals: own read" on goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals: own insert" on goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals: own update" on goals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "goals: own delete" on goals for delete to authenticated using ((select auth.uid()) = user_id);

-- Village rooms: all authenticated users can read
alter table village_rooms enable row level security;
create policy "village_rooms: auth read" on village_rooms for select to authenticated using (true);

-- Village memberships: own read/write
alter table village_memberships enable row level security;
create policy "memberships: own read" on village_memberships for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "memberships: own insert" on village_memberships for insert to authenticated
  with check ((select auth.uid()) = user_id and is_moderator = false);
create policy "memberships: own delete" on village_memberships for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Village messages: members can read/write room messages
alter table village_messages enable row level security;
create policy "messages: member read" on village_messages for select to authenticated
  using (
    exists (
      select 1 from village_memberships
      where village_memberships.room_id = village_messages.room_id
      and village_memberships.user_id = (select auth.uid())
    )
  );
create policy "messages: member insert" on village_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from village_memberships
      where village_memberships.room_id = village_messages.room_id
      and village_memberships.user_id = (select auth.uid())
    )
  );

-- Friday reflections: own read/write
alter table friday_reflections enable row level security;
create policy "reflections: own read" on friday_reflections for select to authenticated using ((select auth.uid()) = user_id);
create policy "reflections: own insert" on friday_reflections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reflections: own update" on friday_reflections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table coach_requests enable row level security;
alter table coach_conversations enable row level security;
alter table coach_messages enable row level security;

create policy "coach conversations: own read" on coach_conversations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "coach conversations: own insert" on coach_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "coach conversations: own update" on coach_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "coach conversations: own delete" on coach_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "coach messages: own read" on coach_messages for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "coach messages: own insert" on coach_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from coach_conversations
      where coach_conversations.id = coach_messages.conversation_id
        and coach_conversations.user_id = (select auth.uid())
    )
  );

-- Atomic, authenticated quota consumption. Direct access to coach_requests stays denied.
create or replace function public.consume_coach_quota()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  minute_count integer;
  day_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select count(*) into minute_count
  from public.coach_requests
  where user_id = current_user_id
    and created_at >= now() - interval '1 minute';

  if minute_count >= 10 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 60);
  end if;

  select count(*) into day_count
  from public.coach_requests
  where user_id = current_user_id
    and created_at >= now() - interval '1 day';

  if day_count >= 100 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 3600);
  end if;

  insert into public.coach_requests (user_id) values (current_user_id);
  delete from public.coach_requests
  where user_id = current_user_id
    and created_at < now() - interval '1 day';

  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

create or replace function public.join_village_room(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  should_moderate boolean;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_room_id::text, 0));
  select not exists (
    select 1 from public.village_memberships where room_id = target_room_id
  ) into should_moderate;

  insert into public.village_memberships (user_id, room_id, is_moderator)
  values (current_user_id, target_room_id, should_moderate)
  on conflict (user_id, room_id) do nothing;

  select is_moderator into should_moderate
  from public.village_memberships
  where user_id = current_user_id and room_id = target_room_id;

  return coalesce(should_moderate, false);
end;
$$;

create or replace function public.assign_village_moderator(target_room_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.village_memberships
    where room_id = target_room_id
      and user_id = auth.uid()
      and is_moderator = true
  ) then
    raise exception 'moderator permission required';
  end if;

  update public.village_memberships
  set is_moderator = true
  where room_id = target_room_id and user_id = target_user_id;

  if not found then
    raise exception 'target user is not a room member';
  end if;
end;
$$;

create or replace function public.get_village_moderator_ids(target_room_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.user_id
  from public.village_memberships member
  where member.room_id = target_room_id
    and member.is_moderator = true
    and exists (
      select 1
      from public.village_memberships viewer
      where viewer.room_id = target_room_id
        and viewer.user_id = auth.uid()
    );
$$;

revoke all on table coach_requests from anon, authenticated;
revoke all on table legal_consents from anon, authenticated;
revoke all on function public.record_legal_consent() from public, anon, authenticated;
revoke all on function public.consume_coach_quota() from public;
revoke all on function public.join_village_room(uuid) from public;
revoke all on function public.assign_village_moderator(uuid, uuid) from public;
revoke all on function public.get_village_moderator_ids(uuid) from public;
grant execute on function public.consume_coach_quota() to authenticated;
grant execute on function public.record_legal_consent() to authenticated;
grant execute on function public.join_village_room(uuid) to authenticated;
grant execute on function public.assign_village_moderator(uuid, uuid) to authenticated;
grant execute on function public.get_village_moderator_ids(uuid) to authenticated;

-- Explicit Data API grants for projects that do not auto-expose new tables.
grant select, update on profiles to authenticated;
grant select on legal_consents to authenticated;
grant select, insert on check_ins to authenticated;
grant select, insert, update, delete on goals to authenticated;
grant select on village_rooms to authenticated;
grant select, insert, delete on village_memberships to authenticated;
grant select, insert on village_messages to authenticated;
grant select, insert, update on friday_reflections to authenticated;
-- Hosted Supabase default privileges can otherwise retain broader grants.
revoke all on coach_conversations, coach_messages from public, anon, authenticated;
grant select, insert, update, delete on coach_conversations to authenticated;
grant select, insert on coach_messages to authenticated;
grant all on all tables in schema public to service_role;

-- Enable realtime for village messages
alter publication supabase_realtime add table village_messages;

-- Membership access is provider-neutral. Clients may inspect their own grant,
-- but only the service role (future verified billing webhooks/admin tools) can
-- create, extend, revoke, or otherwise change access.
create table access_grants (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  plan text not null default 'plus' check (plan in ('core', 'plus')),
  source text not null check (source in ('early_member_trial', 'checkout_trial', 'subscription', 'admin')),
  status text not null default 'active' check (status in ('scheduled', 'active', 'expired', 'revoked')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index access_grants_user_status_dates
  on access_grants (user_id, status, starts_at desc, ends_at);
create unique index access_grants_external_reference_unique
  on access_grants (external_reference);

alter table access_grants enable row level security;
create policy "access grants: own read" on access_grants for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table access_grants from anon, authenticated;
grant select on access_grants to authenticated;
grant all on access_grants to service_role;

-- Stripe identifiers are stored separately from user profiles. Signed webhook
-- processing is the only path that can create or change billing-backed access.
create table billing_customers (
  user_id uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_customers enable row level security;
create policy "billing customers: own read" on billing_customers for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table billing_customers from anon, authenticated;
grant select on billing_customers to authenticated;
grant all on billing_customers to service_role;

create table billing_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table billing_webhook_events enable row level security;
revoke all on table billing_webhook_events from anon, authenticated;
grant all on billing_webhook_events to service_role;

create or replace function public.claim_billing_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_claimed boolean := false;
begin
  insert into public.billing_webhook_events (event_id, event_type, livemode)
  values (p_event_id, p_event_type, p_livemode)
  on conflict (event_id) do update set
    status = 'processing',
    attempt_count = public.billing_webhook_events.attempt_count + 1,
    error = null,
    updated_at = now()
  where public.billing_webhook_events.status = 'failed'
     or (
       public.billing_webhook_events.status = 'processing'
       and public.billing_webhook_events.updated_at < now() - interval '10 minutes'
     )
  returning true into was_claimed;

  return coalesce(was_claimed, false);
end;
$$;

revoke all on function public.claim_billing_webhook_event(text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_billing_webhook_event(text, text, boolean) to service_role;

-- The API supplies the server-resolved tier limits. Values are clamped to the
-- most permissive published Plus limits, so direct RPC calls cannot raise them.
create or replace function public.consume_coach_quota_for_plan(
  p_daily_limit integer,
  p_monthly_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  effective_daily_limit integer := greatest(1, least(p_daily_limit, 30));
  effective_monthly_limit integer := greatest(1, least(p_monthly_limit, 300));
  minute_count integer;
  day_count integer;
  month_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select count(*) into minute_count
  from public.coach_requests
  where user_id = current_user_id and created_at >= now() - interval '1 minute';
  if minute_count >= 10 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 60, 'limit', 'minute');
  end if;

  select count(*) into day_count
  from public.coach_requests
  where user_id = current_user_id and created_at >= now() - interval '1 day';
  if day_count >= effective_daily_limit then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 3600, 'limit', 'day');
  end if;

  select count(*) into month_count
  from public.coach_requests
  where user_id = current_user_id and created_at >= date_trunc('month', now());
  if month_count >= effective_monthly_limit then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 86400, 'limit', 'month');
  end if;

  insert into public.coach_requests (user_id) values (current_user_id);
  delete from public.coach_requests
  where user_id = current_user_id and created_at < date_trunc('month', now());

  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.consume_coach_quota_for_plan(integer, integer) from public, anon, authenticated;
grant execute on function public.consume_coach_quota_for_plan(integer, integer) to authenticated;
