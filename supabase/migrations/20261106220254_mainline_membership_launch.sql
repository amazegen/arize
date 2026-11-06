-- MAINLINE ONLY. Review/apply separately; creating a PR does not activate billing.
do $$ begin
 if to_regclass('public.student_pilot_memberships') is not null then
  raise exception 'Do not run the mainline migration in the isolated Student backend';
 end if;
end $$;

create schema if not exists arize_billing_private;
revoke all on schema arize_billing_private from public, anon;
grant usage on schema arize_billing_private to authenticated, service_role;

create table public.membership_launch (
 id boolean primary key default true check(id), enabled boolean not null default false,
 stripe_mode text not null default 'test' check(stripe_mode in ('test','live')),
 policy_version text not null default 'core-plus-v1' check(policy_version='core-plus-v1'),
 updated_at timestamptz not null default now()
);
insert into public.membership_launch(id) values(true);
create table public.billing_operation_leases (
 user_id uuid primary key references auth.users(id) on delete cascade,
 token uuid not null, expires_at timestamptz not null
);
create table public.account_deletion_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique references auth.users(id) on delete set null,
 status text not null default 'processing' check(status in ('processing','retry_required','completed')),
 stage text not null default 'billing' check(stage in ('billing','storage','account','completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.billing_risk_events (
 event_id text primary key, event_type text not null, livemode boolean not null,
 subscription_ids text[] not null default '{}',
 review_status text not null default 'needs_review' check(review_status in ('needs_review','reviewed')),
 created_at timestamptz not null default now()
);
alter table public.billing_webhook_events add column lease_token uuid;
alter table public.membership_launch enable row level security;
alter table public.billing_operation_leases enable row level security;
alter table public.account_deletion_jobs enable row level security;
alter table public.billing_risk_events enable row level security;
revoke all on public.membership_launch,public.billing_operation_leases,public.account_deletion_jobs,public.billing_risk_events from public,anon,authenticated;
grant all on public.membership_launch,public.billing_operation_leases,public.account_deletion_jobs,public.billing_risk_events to service_role;
grant select on public.account_deletion_jobs to authenticated;
create policy deletion_job_self_read on public.account_deletion_jobs for select to authenticated using(user_id=(select auth.uid()));

create function arize_billing_private.account_active() returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and exists(select 1 from auth.users where id=(select auth.uid())) and not exists(
  select 1 from public.account_deletion_jobs where user_id=(select auth.uid())
 );
$$;
create function arize_billing_private.has_plus() returns boolean
language sql stable security definer set search_path='' as $$
 select arize_billing_private.account_active() and (
  not (select enabled from public.membership_launch where id) or exists(
   select 1 from public.access_grants g where g.user_id=(select auth.uid()) and g.plan='plus'
   and (g.source not in ('subscription','checkout_trial') or g.metadata->>'livemode'=((select stripe_mode from public.membership_launch where id)='live')::text)
   and g.status='active' and g.starts_at<=now() and (
    g.ends_at is null or g.ends_at>now() or (
     g.source='subscription' and g.metadata->>'stripe_status'='active'
     and g.metadata->>'cancel_at_period_end'='false' and g.ends_at+interval '72 hours'>now()
    )
   )
  )
 );
$$;
revoke all on function arize_billing_private.account_active(),arize_billing_private.has_plus() from public,anon;
grant execute on function arize_billing_private.account_active(),arize_billing_private.has_plus() to authenticated,service_role;

create function public.membership_rollout_state() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'policyVersion',policy_version,'stripeMode',stripe_mode)
 from public.membership_launch where id and (select auth.uid()) is not null;
$$;
revoke all on function public.membership_rollout_state() from public,anon;
grant execute on function public.membership_rollout_state() to authenticated,service_role;

-- One durable lease per account serializes checkout, webhook updates and deletion.
create function public.claim_billing_operation(p_user uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare claimed boolean:=false;
begin
 insert into public.billing_operation_leases(user_id,token,expires_at)
 values(p_user,p_token,now()+interval '90 seconds')
 on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at
 where public.billing_operation_leases.expires_at<now()
 returning true into claimed;
 return coalesce(claimed,false);
end $$;
create function public.release_billing_operation(p_user uuid,p_token uuid) returns void
language sql security definer set search_path='' as $$
 delete from public.billing_operation_leases where user_id=p_user and token=p_token;
$$;
revoke all on function public.claim_billing_operation(uuid,uuid),public.release_billing_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_billing_operation(uuid,uuid),public.release_billing_operation(uuid,uuid) to service_role;

create function public.apply_billing_access(p_user uuid,p_token uuid,p_grant jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.billing_operation_leases where user_id=p_user and token=p_token and expires_at>now() for update;
 if not found then raise exception 'Billing lease expired' using errcode='55000'; end if;
 if exists(select 1 from public.account_deletion_jobs where user_id=p_user) then return false; end if;
 if p_grant->>'user_id'<>p_user::text or p_grant->>'plan'<>'plus'
 or p_grant->>'source' not in ('subscription','checkout_trial')
 or p_grant->>'status' not in ('active','revoked')
 or coalesce(p_grant->>'external_reference','') not like 'sub_%' then raise exception 'Invalid billing grant'; end if;
 if not exists(select 1 from public.billing_customers where user_id=p_user and stripe_customer_id=p_grant->'metadata'->>'stripe_customer_id') then raise exception 'Billing owner mismatch'; end if;
 if exists(select 1 from public.access_grants where external_reference=p_grant->>'external_reference' and user_id<>p_user) then raise exception 'Subscription owner conflict'; end if;
 insert into public.access_grants(user_id,plan,source,status,starts_at,ends_at,external_reference,metadata,updated_at)
 values(p_user,'plus',p_grant->>'source',p_grant->>'status',(p_grant->>'starts_at')::timestamptz,(p_grant->>'ends_at')::timestamptz,p_grant->>'external_reference',p_grant->'metadata',now())
 on conflict(external_reference) do update set source=excluded.source,status=excluded.status,
 starts_at=excluded.starts_at,ends_at=excluded.ends_at,metadata=excluded.metadata,updated_at=now();
 return true;
end $$;
revoke all on function public.apply_billing_access(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_billing_access(uuid,uuid,jsonb) to service_role;

create function public.claim_billing_webhook_v2(p_event_id text,p_event_type text,p_livemode boolean,p_token uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r public.billing_webhook_events; inserted boolean:=false;
begin
 if char_length(p_event_id)>120 or p_event_id not like 'evt_%' then raise exception 'Invalid event'; end if;
 insert into public.billing_webhook_events(event_id,event_type,livemode,lease_token)
 values(p_event_id,p_event_type,p_livemode,p_token) on conflict do nothing returning true into inserted;
 if inserted then return 'claimed'; end if;
 select * into r from public.billing_webhook_events where event_id=p_event_id for update;
 if r.status='processed' then return 'processed'; end if;
 if r.status='processing' and r.updated_at>now()-interval '90 seconds' then return 'busy'; end if;
 update public.billing_webhook_events set status='processing',lease_token=p_token,attempt_count=attempt_count+1,error=null,updated_at=now() where event_id=p_event_id;
 return 'claimed';
end $$;
create function public.finish_billing_webhook_v2(p_event_id text,p_token uuid,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.billing_webhook_events set status=case when p_error is null then 'processed' else 'failed' end,
 error=left(p_error,80),updated_at=now(),processed_at=case when p_error is null then now() else null end
 where event_id=p_event_id and lease_token=p_token and status='processing';
 return found;
end $$;
revoke all on function public.claim_billing_webhook_v2(text,text,boolean,uuid),public.finish_billing_webhook_v2(text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_billing_webhook_v2(text,text,boolean,uuid),public.finish_billing_webhook_v2(text,uuid,text) to service_role;

create function public.billing_owned_storage_page(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)),'[]') from(
  select o.bucket_id,o.name from storage.objects o
  where to_jsonb(o)->>'owner_id'=p_user::text or to_jsonb(o)->>'owner'=p_user::text
   or (o.bucket_id='village-audio' and o.name like p_user::text||'/%')
  order by o.bucket_id,o.name limit 100
 )q;
$$;
revoke all on function public.billing_owned_storage_page(uuid) from public,anon,authenticated;
grant execute on function public.billing_owned_storage_page(uuid) to service_role;

-- Old access tokens must not keep reading/writing app data after deletion begins.
do $$ declare t text; begin
 foreach t in array array['profiles','check_ins','goals','village_memberships','village_messages','friday_reflections','coach_conversations','coach_messages','legal_consents','access_grants','billing_customers'] loop
  execute format('create policy mainline_account_active on public.%I as restrictive for all to authenticated using((select arize_billing_private.account_active())) with check((select arize_billing_private.account_active()))',t);
 end loop;
end $$;

create policy mainline_storage_insert on storage.objects as restrictive for insert to authenticated
 with check((select arize_billing_private.account_active()) and (bucket_id<>'village-audio' or
  ((select arize_billing_private.has_plus()) and split_part(name,'/',1)=(select auth.uid())::text)));
create policy mainline_storage_update on storage.objects as restrictive for update to authenticated
 using((select arize_billing_private.account_active()))
 with check((select arize_billing_private.account_active()) and (bucket_id<>'village-audio' or
  ((select arize_billing_private.has_plus()) and split_part(name,'/',1)=(select auth.uid())::text)));

-- Plan limits are database-enforced, not only hidden by browser UI.
update public.goals set is_complete=false where is_complete is null;
alter table public.goals alter column is_complete set not null;
create policy mainline_reflect_window on public.check_ins as restrictive for select to authenticated
 using((select arize_billing_private.has_plus()) or created_at>=now()-interval '7 days');
create policy mainline_goal_window on public.goals as restrictive for select to authenticated
 using((select arize_billing_private.has_plus()) or week_of>=(date_trunc('week',now()+interval '1 day')-interval '1 day')::date);
create policy mainline_reflection_window on public.friday_reflections as restrictive for select to authenticated
 using((select arize_billing_private.has_plus()) or week_of>=date_trunc('week',now())::date);

create function arize_billing_private.goal_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then return new; end if;
 if not arize_billing_private.account_active() then raise exception 'Account deletion in progress' using errcode='42501'; end if;
 if new.user_id<>(select auth.uid()) then raise exception 'Owner required' using errcode='42501'; end if;
 if new.is_complete or arize_billing_private.has_plus() then return new; end if;
 if tg_op='UPDATE' and old.is_complete is not true then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,91));
 if (select count(*) from public.goals where user_id=new.user_id and not is_complete)>=3 then
  raise exception 'Core includes three active goals' using errcode='P0001';
 end if;
 return new;
end $$;
revoke all on function arize_billing_private.goal_limit() from public,anon,authenticated;
create trigger mainline_goal_limit before insert or update on public.goals for each row execute function arize_billing_private.goal_limit();

create function arize_billing_private.room_allowed(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select arize_billing_private.account_active() and ((select arize_billing_private.has_plus())
  or exists(select 1 from public.village_rooms where id=p_room and lower(trim(name))='wins only'));
$$;
revoke all on function arize_billing_private.room_allowed(uuid) from public,anon;
grant execute on function arize_billing_private.room_allowed(uuid) to authenticated,service_role;
create policy mainline_room_membership on public.village_memberships as restrictive for all to authenticated
 using(arize_billing_private.room_allowed(room_id)) with check(arize_billing_private.room_allowed(room_id));
create policy mainline_room_read on public.village_messages as restrictive for select to authenticated
 using(arize_billing_private.room_allowed(room_id));
create policy mainline_room_write on public.village_messages as restrictive for insert to authenticated
 with check(arize_billing_private.room_allowed(room_id) and ((message_type='text' and audio_url is null) or (select arize_billing_private.has_plus())));

-- The legacy room-join RPC is SECURITY DEFINER, so enforce the same plan gate
-- explicitly rather than relying on row policies it would bypass.
create or replace function public.join_village_room(target_room_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); moderate boolean;
begin
 if not arize_billing_private.room_allowed(target_room_id) then raise exception 'Room access requires Plus' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_room_id::text,0));
 select not exists(select 1 from public.village_memberships where room_id=target_room_id) into moderate;
 insert into public.village_memberships(user_id,room_id,is_moderator) values(u,target_room_id,moderate) on conflict(user_id,room_id) do nothing;
 select is_moderator into moderate from public.village_memberships where user_id=u and room_id=target_room_id;
 return coalesce(moderate,false);
end $$;
revoke all on function public.join_village_room(uuid) from public,anon;
grant execute on function public.join_village_room(uuid) to authenticated;

create function arize_billing_private.coach_history_allowed(p_conversation uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select arize_billing_private.account_active() and ((select arize_billing_private.has_plus()) or p_conversation in(
  select id from public.coach_conversations where user_id=(select auth.uid()) order by updated_at desc,id desc limit 3
 ));
$$;
revoke all on function arize_billing_private.coach_history_allowed(uuid) from public,anon;
grant execute on function arize_billing_private.coach_history_allowed(uuid) to authenticated,service_role;
create policy mainline_coach_history on public.coach_conversations as restrictive for select to authenticated
 using(arize_billing_private.coach_history_allowed(id));
create policy mainline_coach_messages_history on public.coach_messages as restrictive for select to authenticated
 using(arize_billing_private.coach_history_allowed(conversation_id));

create or replace function public.consume_coach_quota_for_plan(p_daily_limit integer,p_monthly_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); d integer; m integer;
begin
 if not arize_billing_private.account_active() then raise exception 'Account access required' using errcode='42501'; end if;
 d:=case when arize_billing_private.has_plus() then 30 else 5 end;
 m:=case when arize_billing_private.has_plus() then 300 else 20 end;
 -- Caller limits may reduce a budget, never increase the verified plan budget.
 d:=least(d,greatest(1,coalesce(p_daily_limit,1)));m:=least(m,greatest(1,coalesce(p_monthly_limit,1)));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
 if (select count(*) from public.coach_requests where user_id=u and created_at>=now()-interval '1 minute')>=10 then
  return jsonb_build_object('allowed',false,'retry_after_seconds',60,'limit','minute'); end if;
 if (select count(*) from public.coach_requests where user_id=u and created_at>=now()-interval '1 day')>=d then
  return jsonb_build_object('allowed',false,'retry_after_seconds',3600,'limit','day'); end if;
 if (select count(*) from public.coach_requests where user_id=u and created_at>=date_trunc('month',now()))>=m then
  return jsonb_build_object('allowed',false,'retry_after_seconds',86400,'limit','month'); end if;
 insert into public.coach_requests(user_id) values(u);
 return jsonb_build_object('allowed',true,'retry_after_seconds',0);
end $$;
revoke all on function public.consume_coach_quota_for_plan(integer,integer) from public,anon;
grant execute on function public.consume_coach_quota_for_plan(integer,integer) to authenticated;
-- Legacy endpoint delegates to the same verified plan budget.
create or replace function public.consume_coach_quota() returns jsonb language sql security definer set search_path='' as $$
 select public.consume_coach_quota_for_plan(30,300);
$$;
revoke all on function public.consume_coach_quota() from public,anon;
grant execute on function public.consume_coach_quota() to authenticated;
