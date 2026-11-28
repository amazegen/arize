-- Idempotent upgrade for databases created from an earlier schema.sql.
-- New installations can run schema.sql directly.

alter table profiles add column if not exists username text;
alter table check_ins add column if not exists time_of_day text default 'morning';
alter table goals add column if not exists notes text;
alter table village_messages add column if not exists message_type text default 'text';
alter table village_messages add column if not exists audio_url text;
alter table village_memberships add column if not exists is_moderator boolean default false;

update goals set category = 'Personal' where category = 'Deliverable';
alter table goals drop constraint if exists goals_category_check;
alter table goals add constraint goals_category_check
  check (category in ('Career','Wellness','Reflection','Personal'));

alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,30}$');
create unique index if not exists profiles_username_unique
  on profiles (lower(username))
  where username is not null;

alter table check_ins drop constraint if exists check_ins_time_of_day_check;
alter table check_ins add constraint check_ins_time_of_day_check
  check (time_of_day in ('morning','midday','evening'));

alter table village_messages drop constraint if exists village_messages_message_type_check;
alter table village_messages add constraint village_messages_message_type_check
  check (message_type in ('text','audio','video'));

create table if not exists coach_requests (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now() not null
);
create index if not exists coach_requests_user_id_created_at
  on coach_requests (user_id, created_at desc);
alter table coach_requests enable row level security;

create table if not exists coach_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists coach_conversations_user_updated_at
  on coach_conversations (user_id, updated_at desc);
alter table coach_conversations enable row level security;

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
alter table coach_messages enable row level security;

drop policy if exists "coach conversations: own read" on coach_conversations;
create policy "coach conversations: own read" on coach_conversations for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "coach conversations: own insert" on coach_conversations;
create policy "coach conversations: own insert" on coach_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "coach conversations: own update" on coach_conversations;
create policy "coach conversations: own update" on coach_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "coach conversations: own delete" on coach_conversations;
create policy "coach conversations: own delete" on coach_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "coach messages: own read" on coach_messages;
create policy "coach messages: own read" on coach_messages for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "coach messages: own insert" on coach_messages;
create policy "coach messages: own insert" on coach_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from coach_conversations
      where coach_conversations.id = coach_messages.conversation_id
        and coach_conversations.user_id = (select auth.uid())
    )
  );

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
  where user_id = current_user_id and created_at < now() - interval '1 day';

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
    select 1 from public.village_memberships
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

drop policy if exists "Moderators can assign moderators" on village_memberships;
drop policy if exists "memberships: own insert" on village_memberships;
create policy "memberships: own insert" on village_memberships for insert to authenticated
  with check ((select auth.uid()) = user_id and is_moderator = false);

drop policy if exists "profiles: own update" on profiles;
create policy "profiles: own update" on profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "goals: own update" on goals;
create policy "goals: own update" on goals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "reflections: own update" on friday_reflections;
create policy "reflections: own update" on friday_reflections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table coach_requests from anon, authenticated;
revoke update on village_memberships from authenticated;
revoke all on function public.consume_coach_quota() from public;
revoke all on function public.join_village_room(uuid) from public;
revoke all on function public.assign_village_moderator(uuid, uuid) from public;
revoke all on function public.get_village_moderator_ids(uuid) from public;
grant execute on function public.consume_coach_quota() to authenticated;
grant execute on function public.join_village_room(uuid) to authenticated;
grant execute on function public.assign_village_moderator(uuid, uuid) to authenticated;
grant execute on function public.get_village_moderator_ids(uuid) to authenticated;

grant select, update on profiles to authenticated;
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

-- Record the exact legal documents accepted by each user. Acceptance can only
-- be written through the fixed function so clients cannot forge versions/dates.
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

alter table legal_consents enable row level security;
drop policy if exists "legal_consents: own read" on legal_consents;
create policy "legal_consents: own read" on legal_consents for select to authenticated
  using ((select auth.uid()) = user_id);

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

revoke all on table legal_consents from anon, authenticated;
revoke all on function public.record_legal_consent() from public, anon, authenticated;
grant select on legal_consents to authenticated;
grant execute on function public.record_legal_consent() to authenticated;
grant all on legal_consents to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'village-audio',
  'village-audio',
  true,
  10485760,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'video/webm', 'video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Auth users can upload audio" on storage.objects;
drop policy if exists "Arize users can upload village media" on storage.objects;
create policy "Arize users can upload village media" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'village-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Public can read audio" on storage.objects;
drop policy if exists "Public can read village media" on storage.objects;
create policy "Public can read village media" on storage.objects
  for select
  using (bucket_id = 'village-audio');

-- Provider-neutral membership access. Do not insert the early-member trial
-- grants until the public billing launch date is final; otherwise the 14-day
-- countdown would begin before members can choose a plan.
create table if not exists access_grants (
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

create index if not exists access_grants_user_status_dates
  on access_grants (user_id, status, starts_at desc, ends_at);
drop index if exists access_grants_external_reference_unique;
create unique index if not exists access_grants_external_reference_unique
  on access_grants (external_reference);

alter table access_grants enable row level security;
drop policy if exists "access grants: own read" on access_grants;
create policy "access grants: own read" on access_grants for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table access_grants from anon, authenticated;
grant select on access_grants to authenticated;
grant all on access_grants to service_role;

create table if not exists billing_customers (
  user_id uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_customers enable row level security;
drop policy if exists "billing customers: own read" on billing_customers;
create policy "billing customers: own read" on billing_customers for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table billing_customers from anon, authenticated;
grant select on billing_customers to authenticated;
grant all on billing_customers to service_role;

create table if not exists billing_webhook_events (
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
