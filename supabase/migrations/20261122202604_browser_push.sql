-- ADULT ONLY. Additive and disabled by application flags. No scheduler here.
-- All functions are service-only invokers; browser clients have no grants.
do $$ begin
 if to_regclass('public.student_schools') is not null
 or exists(select 1 from public.clarity_installation where edition <> 'adult')
 then raise exception 'Adult notifications cannot be installed on Student' using errcode='42501';end if;
end $$;

create table public.browser_push_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 reminder_time time not null default '09:00',
 timezone text not null default 'UTC',
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
create table public.browser_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint_hash text not null unique check(endpoint_hash ~ '^[a-f0-9]{64}$'),
 subscription jsonb not null check(jsonb_typeof(subscription)='object'),
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,endpoint_hash)
);
create index browser_push_owner on public.browser_push_subscriptions(user_id);
create table public.browser_push_jobs (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.browser_push_subscriptions(id) on delete cascade,
 local_day date not null,
 preference_version integer not null,
 due_at timestamptz not null,
 expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','expired','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 next_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 unique(subscription_id,local_day)
);
create index browser_push_due on public.browser_push_jobs(next_at) where status in ('pending','sending');
alter table public.browser_push_preferences enable row level security;
alter table public.browser_push_subscriptions enable row level security;
alter table public.browser_push_jobs enable row level security;
revoke all on public.browser_push_preferences,public.browser_push_subscriptions,public.browser_push_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.browser_push_preferences,public.browser_push_subscriptions,public.browser_push_jobs to service_role;

create function public.browser_push_eligible(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select to_regclass('public.student_schools') is null
 and exists(select 1 from public.clarity_installation where edition='adult')
 and not exists(select 1 from public.account_deletion_jobs where user_id=p_user)
 and exists(select 1 from public.legal_consents where user_id=p_user and terms_version='2.0' and privacy_version='2.0')
 and (exists(select 1 from public.check_ins where user_id=p_user)
   or exists(select 1 from public.goals where user_id=p_user and is_complete)
   or exists(select 1 from public.coach_conversations c where c.user_id=p_user
      and exists(select 1 from public.coach_messages m where m.conversation_id=c.id and m.user_id=p_user and m.role='user')
      and exists(select 1 from public.coach_messages m where m.conversation_id=c.id and m.user_id=p_user and m.role='assistant')));
$$;

create function public.browser_push_manage(p_user uuid,p_action text,p_hash text default null,
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

create function public.browser_push_claim(p_limit integer default 20) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult only' using errcode='42501';end if;
 -- Cascades remove queued capabilities; retain only 14 days of delivery metadata.
 delete from public.browser_push_subscriptions where expires_at<=now();
 delete from public.browser_push_jobs where expires_at<now()-interval '14 days';
 update public.browser_push_jobs set status='expired' where expires_at<=now() and status in ('pending','sending');
 -- The database owns the clock. One due slot/device/local date, no late catch-up.
 insert into public.browser_push_jobs(subscription_id,local_day,preference_version,due_at,expires_at)
 select s.id,d.local_day,p.version,d.due,d.due+interval '15 minutes'
 from public.browser_push_subscriptions s join public.browser_push_preferences p on p.user_id=s.user_id
 cross join lateral (select (now() at time zone p.timezone)::date as local_day,
  (((now() at time zone p.timezone)::date+p.reminder_time) at time zone p.timezone) due) d
 where p.enabled and d.due<=now() and d.due>now()-interval '15 minutes'
  and public.browser_push_eligible(s.user_id)
  and not exists(select 1 from public.browser_push_jobs j where j.subscription_id=s.id and j.local_day=d.local_day)
 order by d.due,s.id limit 500 on conflict do nothing;
 with due as (
  select j.id from public.browser_push_jobs j
   join public.browser_push_subscriptions s on s.id=j.subscription_id
   join public.browser_push_preferences p on p.user_id=s.user_id
  where j.status in ('pending','sending') and j.attempts<3 and j.next_at<=now()
   and (j.lease_until is null or j.lease_until<=now()) and j.expires_at>now()
   and p.enabled and p.version=j.preference_version and public.browser_push_eligible(s.user_id)
  order by j.next_at,j.id for update of j skip locked limit least(greatest(p_limit,1),20)
 ), claimed as (
  update public.browser_push_jobs j set status='sending',attempts=attempts+1,
   lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes'
  from due where due.id=j.id returning j.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'token',c.lease_token,'subscription',s.subscription)),'[]'::jsonb)
 into result from claimed c join public.browser_push_subscriptions s on s.id=c.subscription_id;
 return result;
end $$;

create function public.browser_push_lease_valid(p_id uuid,p_token uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.browser_push_jobs j
 join public.browser_push_subscriptions s on s.id=j.subscription_id
 join public.browser_push_preferences p on p.user_id=s.user_id
 where j.id=p_id and j.lease_token=p_token and j.status='sending' and j.lease_until>now()
 and j.expires_at>now() and p.enabled and p.version=j.preference_version
 and public.browser_push_eligible(s.user_id));
$$;
create function public.browser_push_finish(p_id uuid,p_token uuid,p_result text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare job public.browser_push_jobs;
begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult only' using errcode='42501';end if;
 if p_result not in ('sent','retry','gone','failed') then raise exception 'Invalid result' using errcode='22023';end if;
 select * into job from public.browser_push_jobs where id=p_id and lease_token=p_token and status='sending' for update;
 if not found then return false;end if;
 if p_result='gone' then
  delete from public.browser_push_subscriptions where id=job.subscription_id;
  update public.browser_push_preferences p set enabled=false where not exists(select 1 from public.browser_push_subscriptions s where s.user_id=p.user_id);
  return true;
 end if;
 update public.browser_push_jobs set status=case when p_result='retry' and attempts<3 and expires_at>now()+interval '1 minute' then 'pending'
   when p_result='sent' then 'sent' else 'failed' end,
  next_at=now()+interval '1 minute',lease_until=null,lease_token=null where id=p_id;
 return true;
end $$;
revoke all on function public.browser_push_eligible(uuid),public.browser_push_manage(uuid,text,text,jsonb,text,text),
 public.browser_push_claim(integer),public.browser_push_lease_valid(uuid,uuid),public.browser_push_finish(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.browser_push_eligible(uuid),public.browser_push_manage(uuid,text,text,jsonb,text,text),
 public.browser_push_claim(integer),public.browser_push_lease_valid(uuid,uuid),public.browser_push_finish(uuid,uuid,text) to service_role;
