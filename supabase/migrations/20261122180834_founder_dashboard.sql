-- Adult-only reporting. Apply only after a separately approved release.
-- Does not enable billing, alter access grants, assign admins or contact Stripe.
do $$ begin
 if to_regclass('public.student_schools') is not null then
  raise exception 'Founder reporting must be installed in the isolated adult database';
 end if;
end $$;
create schema founder_private;
revoke all on schema founder_private from public,anon,authenticated;
grant usage on schema founder_private to authenticated,service_role;

create table public.founder_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.founder_reporting_installation (
 singleton boolean primary key default true check(singleton),
 capture_started_at timestamptz not null default now()
);
insert into public.founder_reporting_installation default values;
create table public.founder_billing_receipts (
 event_id text primary key references public.billing_webhook_events(event_id) on delete cascade,
 captured_at timestamptz not null default now()
);
create table public.founder_subscription_facts (
 subscription_id text primary key check(subscription_id like 'sub_%'),
 user_id uuid not null references public.profiles(id) on delete cascade,
 livemode boolean not null,
 billing_period text not null check(billing_period in ('monthly','annual')),
 trial_started_at timestamptz,
 trial_ends_at timestamptz,
 first_paid_at timestamptz,
 updated_at timestamptz not null default now(),
 check(trial_ends_at is null or trial_started_at is null or trial_ends_at>trial_started_at)
);
create index founder_facts_cohort on public.founder_subscription_facts(livemode,trial_ends_at) where trial_started_at is not null;
create index founder_facts_owner on public.founder_subscription_facts(user_id);
create index founder_checkins_time on public.check_ins(created_at);
create index founder_goals_time on public.goals(created_at);
create index founder_village_time on public.village_messages(created_at);
create index founder_coach_time on public.coach_messages(created_at,conversation_id,user_id) where role='user';
create index founder_webhooks_time on public.billing_webhook_events(livemode,created_at);

alter table public.founder_admins enable row level security;
alter table public.founder_reporting_installation enable row level security;
alter table public.founder_billing_receipts enable row level security;
alter table public.founder_subscription_facts enable row level security;
revoke all on public.founder_admins,public.founder_reporting_installation,public.founder_billing_receipts,public.founder_subscription_facts from public,anon,authenticated;
grant select,insert,update,delete on public.founder_admins to service_role;
grant select on public.founder_reporting_installation to service_role;
grant select,insert on public.founder_billing_receipts to service_role;
grant select,insert,update on public.founder_subscription_facts to service_role;

create function founder_private.allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and to_regclass('public.student_schools') is null
 and exists(select 1 from public.founder_admins where user_id=auth.uid() and active)
 and not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'
  and coalesce(auth.jwt()->>'aal','aal1')<>'aal2');
$$;
revoke all on function founder_private.allowed() from public,anon,authenticated;
grant execute on function founder_private.allowed() to authenticated;
create function public.founder_dashboard_allowed() returns boolean
language sql stable security invoker set search_path='' as $$ select founder_private.allowed(); $$;
revoke all on function public.founder_dashboard_allowed() from public,anon;
grant execute on function public.founder_dashboard_allowed() to authenticated;

-- Called only after the existing signed, account/mode-checked webhook workflow
-- succeeds. Owner identity comes from our verified grant/customer mapping,
-- never from an email, arbitrary event metadata or a browser parameter.
create function founder_private.record_billing_event(p_event_id text,p_subscription_id text,p_paid_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.billing_webhook_events; g public.access_grants; ts timestamptz; te timestamptz;
begin
 select * into e from public.billing_webhook_events where event_id=p_event_id and status='processed';
 if not found then raise exception 'Processed billing event required' using errcode='22023'; end if;
 if exists(select 1 from public.founder_billing_receipts where event_id=p_event_id) then return false; end if;
 if p_paid_at is not null and (e.event_type<>'invoice.paid' or p_paid_at>now()+interval '5 minutes') then
  raise exception 'Invalid paid observation' using errcode='22023';
 end if;
 if p_subscription_id is not null then
  select a.* into g from public.access_grants a join public.billing_customers b on b.user_id=a.user_id
  where a.external_reference=p_subscription_id and a.plan='plus'
   and a.source in ('subscription','checkout_trial') and a.metadata->>'provider'='stripe'
   and a.metadata->>'livemode'=e.livemode::text
   and a.metadata->>'stripe_customer_id'=b.stripe_customer_id
   and a.metadata->>'billing_period' in ('monthly','annual')
   and not exists(select 1 from public.account_deletion_jobs where user_id=a.user_id);
  if found then
   ts:=nullif(g.metadata->>'trial_started_at','')::timestamptz;
   te:=nullif(g.metadata->>'trial_ends_at','')::timestamptz;
   insert into public.founder_subscription_facts(subscription_id,user_id,livemode,billing_period,trial_started_at,trial_ends_at,first_paid_at)
   values(p_subscription_id,g.user_id,e.livemode,g.metadata->>'billing_period',ts,te,p_paid_at)
   on conflict(subscription_id) do update set
    trial_started_at=coalesce(excluded.trial_started_at,public.founder_subscription_facts.trial_started_at),
    trial_ends_at=coalesce(excluded.trial_ends_at,public.founder_subscription_facts.trial_ends_at),
    first_paid_at=least(public.founder_subscription_facts.first_paid_at,excluded.first_paid_at),
    billing_period=excluded.billing_period,updated_at=now()
   where public.founder_subscription_facts.user_id=excluded.user_id
    and public.founder_subscription_facts.livemode=excluded.livemode;
  end if;
 end if;
 insert into public.founder_billing_receipts(event_id) values(p_event_id) on conflict do nothing;
 return true;
end $$;
revoke all on function founder_private.record_billing_event(text,text,timestamptz) from public,anon,authenticated;
grant execute on function founder_private.record_billing_event(text,text,timestamptz) to service_role;
create function public.founder_record_billing_event(p_event_id text,p_subscription_id text,p_paid_at timestamptz default null)
returns boolean language sql security invoker set search_path='' as $$
 select founder_private.record_billing_event(p_event_id,p_subscription_id,p_paid_at);
$$;
revoke all on function public.founder_record_billing_event(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.founder_record_billing_event(text,text,timestamptz) to service_role;

create function founder_private.dashboard(p_days integer,p_livemode boolean) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare result jsonb; at_time timestamptz:=statement_timestamp(); today date; from_day date;
 start_time timestamptz; activity_start timestamptz; capture_start timestamptz;
begin
 if not founder_private.allowed() then raise exception 'Founder permission required' using errcode='42501'; end if;
 if p_days is null or p_days not in (7,30,90) or p_livemode is null then raise exception 'Invalid reporting range' using errcode='22023'; end if;
 today:=(at_time at time zone 'America/New_York')::date;
 from_day:=today-(p_days-1);
 start_time:=from_day::timestamp at time zone 'America/New_York';
 activity_start:=(least(from_day,today-6)-6)::timestamp at time zone 'America/New_York';
 select capture_started_at into capture_start from public.founder_reporting_installation where singleton;
 with eligible as materialized (
  select u.id,u.created_at from auth.users u join public.profiles p on p.id=u.id
  where u.created_at<at_time and not exists(select 1 from public.founder_admins a where a.user_id=u.id)
   and not exists(select 1 from public.clarity_admins a where a.user_id=u.id)
   and not exists(select 1 from public.account_deletion_jobs j where j.user_id=u.id)
 ), checkins as materialized (
  select c.user_id,c.created_at from public.check_ins c join eligible u on u.id=c.user_id
  where c.created_at>=activity_start and c.created_at<at_time
 ), goals as materialized (
  select c.user_id,c.created_at from public.goals c join eligible u on u.id=c.user_id
  where c.created_at>=activity_start and c.created_at<at_time
 ), village as materialized (
  select c.user_id,c.created_at from public.village_messages c join eligible u on u.id=c.user_id
  where c.created_at>=activity_start and c.created_at<at_time
 ), clarity as materialized (
  select c.user_id,c.conversation_id,c.created_at from public.coach_messages c join eligible u on u.id=c.user_id
  where c.role='user' and c.created_at>=activity_start and c.created_at<at_time
 ), activity as materialized (
  select user_id,created_at from checkins union all select user_id,created_at from goals
  union all select user_id,created_at from village union all select user_id,created_at from clarity
 ), days as (
  select from_day+i as day from generate_series(0,p_days-1) i
 ), trend as (
  select d.day,
   (select count(*) from eligible u where (u.created_at at time zone 'America/New_York')::date=d.day and u.created_at<at_time) registrations,
   (select count(*) from checkins c where (c.created_at at time zone 'America/New_York')::date=d.day) check_ins,
   (select count(distinct conversation_id) from clarity c where (c.created_at at time zone 'America/New_York')::date=d.day) clarity_sessions,
   (select count(distinct user_id) from activity c where c.created_at>=((d.day-6)::timestamp at time zone 'America/New_York')
     and c.created_at<least((d.day+1)::timestamp at time zone 'America/New_York',at_time)) weekly_active
  from days d
 ), grants as materialized (
  select g.* from public.access_grants g join eligible u on u.id=g.user_id
  where g.status='active' and g.starts_at<=at_time and g.ends_at>at_time
   and ((g.source in ('subscription','checkout_trial') and g.metadata->>'livemode'=p_livemode::text) or g.source='early_member_trial')
 ), capture_health as (
  select count(*) filter(where e.status='processed' and r.event_id is null) missing,
   count(*) filter(where e.status<>'processed') pending,
   max(e.processed_at) last_webhook
  from public.billing_webhook_events e left join public.founder_billing_receipts r using(event_id)
  where e.livemode=p_livemode and e.created_at>=capture_start and e.created_at<at_time
 ), cohort as (
  select f.* from public.founder_subscription_facts f join eligible u on u.id=f.user_id
  where f.livemode=p_livemode and f.trial_started_at>=capture_start
   and f.trial_ends_at>=start_time and f.trial_ends_at+interval '168 hours'<=at_time
 ), conversion as (
  select count(*) eligible_trials,count(*) filter(where first_paid_at>=trial_started_at and first_paid_at<=trial_ends_at+interval '168 hours') converted from cohort
 )
 select jsonb_build_object(
  'schemaVersion',1,'asOf',at_time,'timeZone','America/New_York','days',p_days,'fromDay',from_day,'throughDay',today,'billingMode',case when p_livemode then 'live' else 'test' end,
  'registrations',(select count(*) from eligible where created_at>=start_time and created_at<at_time),
  'registeredAccounts',(select count(*) from eligible where created_at<at_time),
  'weeklyActiveUsers',(select count(distinct user_id) from activity where created_at>=(today-6)::timestamp at time zone 'America/New_York'),
  'activeUsers',(select count(distinct user_id) from activity where created_at>=start_time),
  'checkIns',(select count(*) from checkins where created_at>=start_time),
  'claritySessions',(select count(distinct conversation_id) from clarity where created_at>=start_time),
  'featureUsers',jsonb_build_object('checkIns',(select count(distinct user_id) from checkins where created_at>=start_time),
   'clarity',(select count(distinct user_id) from clarity where created_at>=start_time),'goals',(select count(distinct user_id) from goals where created_at>=start_time),
   'village',(select count(distinct user_id) from village where created_at>=start_time)),
  'billing',jsonb_build_object(
   'monthly',(select count(*) from grants where source='subscription' and metadata->>'stripe_status'='active' and metadata->>'billing_period'='monthly' and coalesce(metadata->>'payment_grace','false')='false'),
   'annual',(select count(*) from grants where source='subscription' and metadata->>'stripe_status'='active' and metadata->>'billing_period'='annual' and coalesce(metadata->>'payment_grace','false')='false'),
   'stripeTrials',(select count(*) from grants where source='checkout_trial' and metadata->>'stripe_status'='trialing'),
   'complimentaryTrials',(select count(distinct user_id) from grants where source='early_member_trial'),
   'unclassified',(select count(*) from public.access_grants g join eligible u on u.id=g.user_id
    where g.status='active' and g.starts_at<=at_time and g.ends_at>at_time and g.source in ('subscription','checkout_trial')
     and (g.metadata->>'livemode'=p_livemode::text or coalesce(g.metadata->>'livemode','') not in ('true','false'))
     and coalesce(g.metadata->>'payment_grace','false')='false'
     and (coalesce(g.metadata->>'livemode','') not in ('true','false') or coalesce(g.metadata->>'billing_period','') not in ('monthly','annual')
      or coalesce(g.metadata->>'stripe_status','') not in ('active','trialing')))),
  'conversion',jsonb_build_object('captureStartedAt',capture_start,'eligibleTrials',case when h.missing+h.pending=0 then c.eligible_trials else null end,
   'convertedTrials',case when h.missing+h.pending=0 then c.converted else null end,'missingCaptures',h.missing,'pendingWebhooks',h.pending,'lastWebhookAt',h.last_webhook),
  'trend',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'registrations',registrations,'checkIns',check_ins,'claritySessions',clarity_sessions,'weeklyActiveUsers',weekly_active) order by day),'[]') from trend)
 ) into result from capture_health h cross join conversion c;
 return result;
end $$;
revoke all on function founder_private.dashboard(integer,boolean) from public,anon,authenticated;
grant execute on function founder_private.dashboard(integer,boolean) to authenticated;
create function public.founder_dashboard(p_days integer default 30,p_livemode boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$ select founder_private.dashboard(p_days,p_livemode); $$;
revoke all on function public.founder_dashboard(integer,boolean) from public,anon;
grant execute on function public.founder_dashboard(integer,boolean) to authenticated;
