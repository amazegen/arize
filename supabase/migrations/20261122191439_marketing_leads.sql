-- Adult marketing only; install only in a separately approved release.
-- Does not change Auth, app access, Stripe, Student tables or provider settings.
do $$ begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult marketing cannot be installed in Student';end if;
end $$;
create table public.marketing_leads (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(btrim(email)) and char_length(email) between 3 and 254 and email !~ '[[:space:]]'),
 consent_version text not null check(consent_version='arize-marketing-2026-11-22'),
 consent_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 notification_status text not null default 'pending' check(notification_status in ('pending','sending','sent','review')),
 notification_attempts integer not null default 0 check(notification_attempts between 0 and 5),
 notification_first_attempt timestamptz,
 notification_config_hash text,
 notification_token uuid,
 notification_lease_until timestamptz,
 notification_next_at timestamptz not null default now(),
 notified_at timestamptz
);
create table public.marketing_rate_limits (
 bucket_key text not null,
 window_start timestamptz not null,
 attempts integer not null check(attempts>0),
 expires_at timestamptz not null,
 primary key(bucket_key,window_start)
);
create index marketing_rate_expiry on public.marketing_rate_limits(expires_at);
create index marketing_lead_retention on public.marketing_leads(created_at);
create index marketing_notification_due on public.marketing_leads(notification_next_at,created_at) where notification_status in ('pending','sending');
alter table public.marketing_leads enable row level security;
alter table public.marketing_rate_limits enable row level security;
revoke all on public.marketing_leads,public.marketing_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_leads,public.marketing_rate_limits to service_role;

-- Server-only writes. These are INVOKER functions; no browser insert policies
-- or public definer are needed. Quotas are atomic across concurrent requests.
create function public.marketing_capture_lead(p_email text,p_ip_key text,p_email_key text,p_consent_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bucket text; cap integer; n integer; lead_id uuid; window_at timestamptz:=date_trunc('hour',now());
begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult marketing only' using errcode='42501';end if;
 if p_email is null or p_email<>lower(btrim(p_email)) or char_length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or p_consent_version is distinct from 'arize-marketing-2026-11-22'
  or p_ip_key is null or p_ip_key !~ '^[a-f0-9]{64}$' or p_email_key is null or p_email_key !~ '^[a-f0-9]{64}$'
 then raise exception 'Invalid marketing request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('arize-marketing-capture',0));
 delete from public.marketing_rate_limits where expires_at<now();
 for bucket,cap in select * from (values('global',1000),('ip:'||p_ip_key,10),('email:'||p_email_key,3)) q loop
  insert into public.marketing_rate_limits(bucket_key,window_start,attempts,expires_at)
  values(bucket,window_at,1,window_at+interval '2 hours')
  on conflict(bucket_key,window_start) do update set attempts=least(public.marketing_rate_limits.attempts+1,1001)
  returning attempts into n;
  if n>cap then return jsonb_build_object('accepted',false,'leadId',null);end if;
 end loop;
 -- A fresh explicit opt-in after the retention window is a new request, not
 -- a silent duplicate of an expired record awaiting maintenance.
 delete from public.marketing_leads where email=p_email and created_at<now()-interval '180 days';
 insert into public.marketing_leads(email,consent_version) values(p_email,p_consent_version)
 on conflict(email) do nothing returning id into lead_id;
 -- Duplicates neither overwrite consent nor enqueue a second notification.
 return jsonb_build_object('accepted',true,'leadId',lead_id);
end $$;

create function public.marketing_claim_notification(p_lead_id uuid,p_config_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.marketing_leads; token uuid:=gen_random_uuid();
begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult marketing only' using errcode='42501';end if;
 if p_config_hash is null or p_config_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid notification config' using errcode='22023';end if;
 select * into r from public.marketing_leads
 where (p_lead_id is null or id=p_lead_id) and created_at>=now()-interval '180 days'
  and notification_next_at<=now() and (notification_status='pending' or (notification_status='sending' and notification_lease_until<now()))
 order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 -- Provider idempotency lasts 24h. Stop automatic retry BEFORE that deadline;
 -- also stop if the configured recipient/template changed after first attempt.
 if r.notification_attempts>=5 or r.notification_first_attempt<now()-interval '23 hours'
  or (r.notification_config_hash is not null and r.notification_config_hash<>p_config_hash)
 then update public.marketing_leads set notification_status='review',notification_token=null,notification_lease_until=null where id=r.id;return null;end if;
 update public.marketing_leads set notification_status='sending',notification_attempts=notification_attempts+1,
  notification_token=token,notification_lease_until=now()+interval '10 minutes',
  notification_first_attempt=coalesce(notification_first_attempt,now()),notification_config_hash=p_config_hash
 where id=r.id;
 return jsonb_build_object('id',r.id,'email',r.email,'token',token);
end $$;

create function public.marketing_finish_notification(p_lead_id uuid,p_token uuid,p_result text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult marketing only' using errcode='42501';end if;
 if p_result is null or p_result not in ('sent','retry','review') then raise exception 'Invalid notification result' using errcode='22023';end if;
 update public.marketing_leads set
  notification_status=case when p_result='sent' then 'sent' when p_result='review' or notification_attempts>=5 then 'review' else 'pending' end,
  notified_at=case when p_result='sent' then now() else notified_at end,
  notification_next_at=now()+interval '15 minutes',notification_token=null,notification_lease_until=null
 where id=p_lead_id and notification_status='sending' and notification_token=p_token;
 get diagnostics changed=row_count;return changed=1;
end $$;

-- Explicit maintenance, not a scheduled job or automatic hosted operation.
create function public.marketing_purge_expired() returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult marketing only' using errcode='42501';end if;
 delete from public.marketing_leads where created_at<now()-interval '180 days';get diagnostics n=row_count;
 delete from public.marketing_rate_limits where expires_at<now();return n;
end $$;
revoke all on function public.marketing_capture_lead(text,text,text,text),public.marketing_claim_notification(uuid,text),public.marketing_finish_notification(uuid,uuid,text),public.marketing_purge_expired() from public,anon,authenticated;
grant execute on function public.marketing_capture_lead(text,text,text,text),public.marketing_claim_notification(uuid,text),public.marketing_finish_notification(uuid,uuid,text),public.marketing_purge_expired() to service_role;
