begin;
do $$begin
 if to_regclass('public.student_schools') is not null or not exists(select 1 from public.clarity_installation where edition='adult')
 then raise exception 'Adult installation required';end if;
end $$;
create schema push_private;
revoke all on schema push_private from public,anon,authenticated;
grant usage on schema push_private to service_role;
create table public.browser_push_control(id boolean primary key default true check(id),enabled boolean not null default false);
insert into public.browser_push_control default values;
create table public.browser_push_runs(id bigint generated always as identity primary key,recorded_at timestamptz not null default now(),summary jsonb not null);
create index browser_push_run_time on public.browser_push_runs(recorded_at desc);
alter table public.browser_push_control enable row level security;
alter table public.browser_push_runs enable row level security;
revoke all on public.browser_push_control,public.browser_push_runs from public,anon,authenticated;
grant select,update on public.browser_push_control to service_role;
grant select,insert,delete on public.browser_push_runs to service_role;
grant usage on sequence public.browser_push_runs_id_seq to service_role;
-- Narrow Auth lookup, not a broad service-role grant on Auth tables.
create function push_private.account_enabled(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null
  and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<=now()))
 and exists(select 1 from public.profiles where id=p_user and onboarded);
$$;
revoke all on function push_private.account_enabled(uuid) from public,anon,authenticated;
grant execute on function push_private.account_enabled(uuid) to service_role;
create or replace function public.browser_push_eligible(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select to_regclass('public.student_schools') is null
 and exists(select 1 from public.clarity_installation where edition='adult')
 and push_private.account_enabled(p_user)
 and not exists(select 1 from public.account_deletion_jobs where user_id=p_user)
 and exists(select 1 from public.legal_consents where user_id=p_user and terms_version='2.0' and privacy_version='2.0')
 and (exists(select 1 from public.check_ins where user_id=p_user)
  or exists(select 1 from public.goals where user_id=p_user and is_complete)
  or exists(select 1 from public.coach_conversations c where c.user_id=p_user
   and exists(select 1 from public.coach_messages m where m.conversation_id=c.id and m.user_id=p_user and m.role='user')
   and exists(select 1 from public.coach_messages m where m.conversation_id=c.id and m.user_id=p_user and m.role='assistant')));
$$;
create or replace function public.browser_push_claim(p_limit integer default 20) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if to_regclass('public.student_schools') is not null or not exists(select 1 from public.clarity_installation where edition='adult') then raise exception 'Adult only' using errcode='42501';end if;
 if not exists(select 1 from public.browser_push_control where id and enabled) then return '[]'::jsonb;end if;
 delete from public.browser_push_subscriptions where expires_at<=now();
 delete from public.browser_push_jobs where expires_at<now()-interval '14 days';
 update public.browser_push_jobs set status='expired' where expires_at<=now() and status in('pending','sending');
 insert into public.browser_push_jobs(subscription_id,local_day,preference_version,due_at,expires_at)
 select s.id,d.local_day,p.version,d.due,d.due+interval '15 minutes'
 from public.browser_push_subscriptions s join public.browser_push_preferences p on p.user_id=s.user_id
 cross join lateral(select (now() at time zone p.timezone)::date as local_day,
  (((now() at time zone p.timezone)::date+p.reminder_time) at time zone p.timezone) due) d
 where p.enabled and d.due<=now() and d.due>now()-interval '15 minutes' and public.browser_push_eligible(s.user_id)
 and not exists(select 1 from public.browser_push_jobs j where j.subscription_id=s.id and j.local_day=d.local_day)
 order by d.due,s.id limit 500 on conflict do nothing;
 with due as (
  select j.id from public.browser_push_jobs j join public.browser_push_subscriptions s on s.id=j.subscription_id
  join public.browser_push_preferences p on p.user_id=s.user_id
  where j.status in('pending','sending') and j.attempts<3 and j.next_at<=now() and (j.lease_until is null or j.lease_until<=now())
  and j.expires_at>now() and p.enabled and p.version=j.preference_version and public.browser_push_eligible(s.user_id)
  order by j.next_at,j.id for update of j skip locked limit least(greatest(p_limit,1),20)
 ), claimed as (
  update public.browser_push_jobs j set status='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes'
  from due where due.id=j.id returning j.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'token',c.lease_token,'subscription',s.subscription)),'[]'::jsonb)
 into result from claimed c join public.browser_push_subscriptions s on s.id=c.subscription_id;
 return result;
end $$;
create or replace function public.browser_push_lease_valid(p_id uuid,p_token uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.browser_push_control where id and enabled)
 and exists(select 1 from public.browser_push_jobs j join public.browser_push_subscriptions s on s.id=j.subscription_id
 join public.browser_push_preferences p on p.user_id=s.user_id
 where j.id=p_id and j.lease_token=p_token and j.status='sending' and j.lease_until>now() and j.expires_at>now()
 and p.enabled and p.version=j.preference_version and public.browser_push_eligible(s.user_id));
$$;
create function public.browser_push_record_run(p_summary jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare k text;clean jsonb:='{}'::jsonb;v text;
begin
 if to_regclass('public.student_schools') is not null or not exists(select 1 from public.clarity_installation where edition='adult') then raise exception 'Adult only' using errcode='42501';end if;
 if jsonb_typeof(p_summary)<>'object' or p_summary->>'state' is null or p_summary->>'state' not in('complete','disabled','partial')
 or p_summary->>'stop' is null or p_summary->>'stop' not in('empty','limit','budget','configuration','provider_auth','storage') then raise exception 'Invalid summary';end if;
 clean:=jsonb_build_object('state',p_summary->>'state','stop',p_summary->>'stop');
 foreach k in array array['claimed','sent','retry','removed','failed','revoked','unconfirmed','elapsedMs'] loop
  v:=p_summary->>k;
  if v is null or v !~ '^[0-9]+$' or length(v)>6 or v::integer>(case when k='elapsedMs' then 120000 else 500 end) then raise exception 'Invalid counter';end if;
  clean:=clean||jsonb_build_object(k,v::integer);
 end loop;
 insert into public.browser_push_runs(summary) values(clean);
 delete from public.browser_push_runs where recorded_at<now()-interval '14 days';
 return true;
end $$;
create function public.browser_push_health() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('enabled',coalesce((select enabled from public.browser_push_control where id),false),
  'pending',(select count(*) from public.browser_push_jobs where status='pending' and expires_at>now()),
  'leased',(select count(*) from public.browser_push_jobs where status='sending' and expires_at>now()),
  'oldestDueSeconds',coalesce((select greatest(0,floor(extract(epoch from now()-min(due_at)))) from public.browser_push_jobs where status in('pending','sending') and expires_at>now()),0),
  'failedDue24h',(select count(*) from public.browser_push_jobs where status='failed' and due_at>now()-interval '24 hours'),
  'expiredDue24h',(select count(*) from public.browser_push_jobs where status='expired' and due_at>now()-interval '24 hours'),
  'lastRunAt',(select recorded_at from public.browser_push_runs order by recorded_at desc,id desc limit 1),
  'lastRun',(select summary from public.browser_push_runs order by recorded_at desc,id desc limit 1))
 where to_regclass('public.student_schools') is null and exists(select 1 from public.clarity_installation where edition='adult');
$$;
revoke all on function public.browser_push_record_run(jsonb),public.browser_push_health() from public,anon,authenticated;
grant execute on function public.browser_push_record_run(jsonb),public.browser_push_health() to service_role;
create function public.browser_push_pause() returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.browser_push_control set enabled=false where id;return true;
end $$;
revoke all on function public.browser_push_pause() from public,anon,authenticated;
grant execute on function public.browser_push_pause() to service_role;
create or replace function public.browser_push_manage(p_user uuid,p_action text,p_hash text default null,
 p_subscription jsonb default null,p_time text default null,p_zone text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prefs public.browser_push_preferences; owner_id uuid; eligible boolean;
begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult only' using errcode='42501';end if;
 if p_action not in ('state','register','schedule','disable') or p_user is null then raise exception 'Invalid action' using errcode='22023';end if;
 eligible:=public.browser_push_eligible(p_user);
 if p_action in ('register','schedule') then
  if not eligible then return jsonb_build_object('error','ineligible');end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)
  then raise exception 'Invalid schedule' using errcode='22023';end if;
  insert into public.browser_push_preferences(user_id) values(p_user) on conflict do nothing;
  select * into prefs from public.browser_push_preferences where user_id=p_user for update;
  -- Serialize device additions/schedule changes per account, bound write churn.
  if prefs.enabled and prefs.updated_at>clock_timestamp()-interval '1 second' then return jsonb_build_object('error','busy');end if;
  if p_action='register' then
   -- Expired devices must not consume the five-device budget while delivery is paused.
   delete from public.browser_push_subscriptions where user_id=p_user and expires_at<=now();
   if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_subscription is null
    or length(p_subscription::text)>4096 or jsonb_typeof(p_subscription)<>'object'
   then raise exception 'Invalid subscription' using errcode='22023';end if;
   select user_id into owner_id from public.browser_push_subscriptions where endpoint_hash=p_hash;
   if owner_id is not null and owner_id<>p_user then return jsonb_build_object('error','owned');end if;
   if owner_id is null and (select count(*) from public.browser_push_subscriptions where user_id=p_user)>=5
   then return jsonb_build_object('error','device_limit');end if;
   insert into public.browser_push_subscriptions(user_id,endpoint_hash,subscription,expires_at)
   values(p_user,p_hash,p_subscription,case when jsonb_typeof(p_subscription->'expirationTime')='number' then to_timestamp((p_subscription->>'expirationTime')::double precision/1000) end)
   on conflict(endpoint_hash) do update set subscription=excluded.subscription,expires_at=excluded.expires_at
     where browser_push_subscriptions.user_id=excluded.user_id;
   -- A conflicting insert from another account must never reassign a device.
   if not found then return jsonb_build_object('error','owned');end if;
  elsif not exists(select 1 from public.browser_push_subscriptions where user_id=p_user) then
   return jsonb_build_object('error','no_device');
  end if;
  update public.browser_push_preferences set enabled=true,reminder_time=p_time::time,timezone=p_zone,
   version=version+1,updated_at=clock_timestamp() where user_id=p_user;
  update public.browser_push_jobs j set status='cancelled' from public.browser_push_subscriptions s
   where j.subscription_id=s.id and s.user_id=p_user and j.status in ('pending','sending');
 elsif p_action='disable' then
  delete from public.browser_push_subscriptions where user_id=p_user and endpoint_hash=p_hash;
  if not exists(select 1 from public.browser_push_subscriptions where user_id=p_user) then
   update public.browser_push_preferences set enabled=false,version=version+1,updated_at=clock_timestamp() where user_id=p_user;
  end if;
 end if;
 select * into prefs from public.browser_push_preferences where user_id=p_user;
 return jsonb_build_object('eligible',eligible,'enabled',coalesce(prefs.enabled,false),'subscribed',
  exists(select 1 from public.browser_push_subscriptions where user_id=p_user and endpoint_hash=p_hash),
  'time',coalesce(to_char(prefs.reminder_time,'HH24:MI'),'09:00'),'timezone',coalesce(prefs.timezone,'UTC'));
end $$;
commit;
