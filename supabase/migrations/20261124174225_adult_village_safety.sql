-- Adult only. Prepared for review; never apply to Student or a hosted target implicitly.
begin;
do $$ begin
 if not exists(select 1 from public.clarity_installation where edition='adult') then
  raise exception 'Adult installation required'; end if;
end $$;
create schema village_safety_private;
revoke all on schema village_safety_private from public,anon,authenticated;
grant usage on schema village_safety_private to authenticated,service_role;
create table village_safety_private.moderators (
 user_id uuid references auth.users on delete cascade, room_id uuid references public.village_rooms on delete cascade,
 active boolean not null default true, primary key(user_id,room_id)
);
create table village_safety_private.blocks (
 user_id uuid references auth.users on delete cascade, blocked_id uuid references auth.users on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,blocked_id), check(user_id<>blocked_id)
);
create index village_block_reverse on village_safety_private.blocks(blocked_id,user_id);
create table village_safety_private.reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid references auth.users on delete cascade,
 message_id uuid references public.village_messages on delete cascade not null,
 room_id uuid references public.village_rooms on delete cascade not null,
 reason text not null check(reason in('spam','harassment','hate','sexual','violence','other')),
 status text not null default 'open' check(status in('open','hidden','dismissed','restored')),
 created_at timestamptz not null default now(), unique(reporter_id,message_id)
);
create index village_reports_queue on village_safety_private.reports(room_id,created_at desc);
create index village_reports_rate on village_safety_private.reports(reporter_id,created_at desc);
create table village_safety_private.hidden (
 message_id uuid primary key references public.village_messages on delete cascade,
 created_at timestamptz not null default now()
);
create table village_safety_private.mutes (
 room_id uuid references public.village_rooms on delete cascade, user_id uuid references auth.users on delete cascade,
 until_at timestamptz not null, primary key(room_id,user_id)
);
create table village_safety_private.audit (
 id bigint generated always as identity primary key, actor_id uuid references auth.users on delete set null,
 room_id uuid references public.village_rooms on delete cascade,
 message_id uuid references public.village_messages on delete set null,
 decision text not null check(decision in('hide','dismiss','restore','mute','unmute')), created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['moderators','blocks','reports','hidden','mutes','audit'] loop
  execute format('alter table village_safety_private.%I enable row level security',t);
  execute format('revoke all on village_safety_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
-- Assignment requires an explicit trusted operator; nobody is assigned by this migration.
grant select,insert,update,delete on village_safety_private.moderators to service_role;
grant select on village_safety_private.audit to service_role;

create function village_safety_private.visible(p_message uuid,p_author uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from village_safety_private.hidden where message_id=p_message)
 and not exists(select 1 from village_safety_private.blocks where
  (user_id=auth.uid() and blocked_id=p_author) or (blocked_id=auth.uid() and user_id=p_author));
$$;
revoke all on function village_safety_private.visible(uuid,uuid) from public,anon;
grant execute on function village_safety_private.visible(uuid,uuid) to authenticated;
create policy village_safety_visibility on public.village_messages as restrictive for select to authenticated
 using(village_safety_private.visible(id,user_id));
revoke update,delete on public.village_messages from anon,authenticated;

-- Never derive moderator authority from being the first visitor or user-editable metadata.
create or replace function public.join_village_room(target_room_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not arize_billing_private.room_allowed(target_room_id) then raise exception 'Room unavailable' using errcode='42501'; end if;
 insert into public.village_memberships(user_id,room_id,is_moderator) values(auth.uid(),target_room_id,false)
 on conflict(user_id,room_id) do nothing;
 return exists(select 1 from village_safety_private.moderators where user_id=auth.uid() and room_id=target_room_id and active);
end $$;
revoke all on function public.assign_village_moderator(uuid,uuid) from public,anon,authenticated;
create or replace function public.get_village_moderator_ids(target_room_id uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
 select m.user_id from village_safety_private.moderators m
 where m.room_id=target_room_id and m.active and arize_billing_private.room_allowed(target_room_id)
 and exists(select 1 from public.village_memberships where room_id=target_room_id and user_id=auth.uid());
$$;

create index village_message_sender_time on public.village_messages(user_id,created_at desc);
create function village_safety_private.message_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare last_at timestamptz; at_time timestamptz:=clock_timestamp();
begin
 -- Trusted SQL/seed/service operations remain possible; browser and native writes use authenticated.
 if current_setting('role',true)<>'authenticated' then return new; end if;
 if new.user_id is distinct from auth.uid() or not arize_billing_private.room_allowed(new.room_id)
 or not exists(select 1 from public.village_memberships where user_id=auth.uid() and room_id=new.room_id)
 then raise exception 'Room access required' using errcode='42501'; end if;
 if length(trim(new.content)) not between 1 and 4000 then raise exception 'Message must contain 1–4000 characters' using errcode='22023'; end if;
 if new.message_type in('audio','video') and (new.audio_url is null or new.audio_url !~ ('^'||new.user_id::text||'/'||new.room_id::text||'/[A-Za-z0-9._-]+$'))
 then raise exception 'Use an owned Village upload' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,7624));
 -- Preserve existing idempotent retry semantics: the PK conflict is checked by the API.
 if exists(select 1 from public.village_messages where id=new.id) then return new; end if;
 if exists(select 1 from village_safety_private.mutes where user_id=auth.uid() and room_id=new.room_id and until_at>at_time)
 then raise exception 'Posting is paused in this room' using errcode='P0001'; end if;
 select max(created_at) into last_at from public.village_messages where user_id=new.user_id;
 if last_at>at_time-interval '2 seconds'
 or (select count(*) from public.village_messages where user_id=new.user_id and created_at>at_time-interval '1 minute')>=10
 or (select count(*) from public.village_messages where user_id=new.user_id and created_at>at_time-interval '1 hour')>=120
 then raise exception 'Please wait before sending more messages' using errcode='P0001'; end if;
 if exists(select 1 from public.village_messages where user_id=new.user_id and created_at>at_time-interval '10 minutes'
  and lower(regexp_replace(trim(content),'\s+',' ','g'))=lower(regexp_replace(trim(new.content),'\s+',' ','g')))
 then raise exception 'Please do not repeat the same message' using errcode='P0001'; end if;
 new.created_at:=at_time; new.content:=trim(new.content); return new;
end $$;
revoke all on function village_safety_private.message_guard() from public,anon,authenticated;
create trigger village_safety_message before insert on public.village_messages for each row execute function village_safety_private.message_guard();

create function village_safety_private.action(p_action text,p_room uuid,p_message uuid,p_target uuid,p_reason text,p_decision text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.village_messages; is_mod boolean; result jsonb;
begin
 if not arize_billing_private.account_active() or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and not is_anonymous)
 then raise exception 'Verified account required' using errcode='42501'; end if;
 if exists(select 1 from auth.mfa_factors where user_id=u and status='verified') and coalesce(auth.jwt()->>'aal','aal1')<>'aal2'
 then raise exception 'Complete account verification' using errcode='42501'; end if;
 if p_action='unblock' then
  delete from village_safety_private.blocks where user_id=u and blocked_id=p_target;return jsonb_build_object('saved',true);
 end if;
 if not arize_billing_private.room_allowed(p_room) or not exists(select 1 from public.village_memberships where room_id=p_room and user_id=u)
 then raise exception 'Room membership required' using errcode='42501'; end if;
 is_mod:=exists(select 1 from village_safety_private.moderators where user_id=u and room_id=p_room and active);
 if p_action='state' then
  select coalesce(jsonb_agg(jsonb_build_object('id',b.blocked_id,'name',coalesce(p.name,'Village member')) order by b.created_at),'[]') into result
  from village_safety_private.blocks b left join public.profiles p on p.id=b.blocked_id where b.user_id=u;
  return jsonb_build_object('moderator',is_mod,'blocks',result);
 end if;
 if p_action='queue' then
  if not is_mod then raise exception 'Moderator required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
   select r.message_id as "messageId",r.reason,r.status,r.created_at as "createdAt",left(msg.content,4000) as content,
    exists(select 1 from village_safety_private.mutes where room_id=p_room and user_id=msg.user_id and until_at>now()) as muted
   from village_safety_private.reports r join public.village_messages msg on msg.id=r.message_id
   where r.room_id=p_room order by (r.status='open') desc,r.created_at desc limit 50
  ) q;
  return jsonb_build_object('reports',result);
 end if;
 select * into m from public.village_messages where id=p_message and room_id=p_room;
 if m.id is null then raise exception 'Message unavailable' using errcode='42501'; end if;
 if p_action in('block','report') then
  if m.user_id=u or not village_safety_private.visible(m.id,m.user_id) then raise exception 'Message unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,7625));
  if p_action='block' then
   if not exists(select 1 from village_safety_private.blocks where user_id=u and blocked_id=m.user_id)
    and (select count(*) from village_safety_private.blocks where user_id=u)>=100 then raise exception 'Blocked-account limit reached' using errcode='P0001'; end if;
   insert into village_safety_private.blocks(user_id,blocked_id) values(u,m.user_id) on conflict do nothing;
  else
   if p_reason is null or p_reason not in('spam','harassment','hate','sexual','violence','other') then raise exception 'Choose a report reason' using errcode='22023'; end if;
   if not exists(select 1 from village_safety_private.reports where reporter_id=u and message_id=m.id)
    and (select count(*) from village_safety_private.reports where reporter_id=u and created_at>now()-interval '1 hour')>=5
    then raise exception 'Please wait before submitting more reports' using errcode='P0001'; end if;
   insert into village_safety_private.reports(reporter_id,message_id,room_id,reason) values(u,m.id,p_room,p_reason) on conflict(reporter_id,message_id) do nothing;
  end if;
  return jsonb_build_object('saved',true);
 end if;
 if p_action='moderate' then
  if not is_mod then raise exception 'Moderator required' using errcode='42501'; end if;
  if p_decision is null or p_decision not in('hide','dismiss','restore','mute','unmute') then raise exception 'Choose a moderation action' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_message::text,7626));
  if not exists(select 1 from village_safety_private.reports where message_id=m.id and room_id=p_room) then raise exception 'Reported message required' using errcode='42501'; end if;
  if p_decision='hide' then insert into village_safety_private.hidden(message_id) values(m.id) on conflict do nothing;
  elsif p_decision='restore' then delete from village_safety_private.hidden where message_id=m.id;
  elsif p_decision='mute' then insert into village_safety_private.mutes(room_id,user_id,until_at) values(p_room,m.user_id,now()+interval '24 hours') on conflict(room_id,user_id) do update set until_at=excluded.until_at;
  elsif p_decision='unmute' then delete from village_safety_private.mutes where room_id=p_room and user_id=m.user_id;
  end if;
  if p_decision in('hide','dismiss','restore') then update village_safety_private.reports set status=case p_decision when 'hide' then 'hidden' when 'restore' then 'restored' else 'dismissed' end where message_id=m.id and room_id=p_room; end if;
  insert into village_safety_private.audit(actor_id,room_id,message_id,decision) values(u,p_room,m.id,p_decision);
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown safety action' using errcode='22023';
end $$;
revoke all on function village_safety_private.action(text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function village_safety_private.action(text,uuid,uuid,uuid,text,text) to authenticated;
create function public.village_safety(p_action text,p_room uuid default null,p_message uuid default null,p_target uuid default null,p_reason text default null,p_decision text default null) returns jsonb
language sql security invoker set search_path='' as $$ select village_safety_private.action(p_action,p_room,p_message,p_target,p_reason,p_decision); $$;
revoke all on function public.village_safety(text,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.village_safety(text,uuid,uuid,uuid,text,text) to authenticated;

-- Old public URLs stop working; no files are moved or removed. Existing rows remain readable via signed links.
update storage.buckets set public=false where id='village-audio';
create function village_safety_private.media_allowed(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.village_messages m where m.message_type in('audio','video')
  and (m.audio_url=p_name or right(m.audio_url,length('/storage/v1/object/public/village-audio/'||p_name))='/storage/v1/object/public/village-audio/'||p_name)
  and arize_billing_private.room_allowed(m.room_id)
  and exists(select 1 from public.village_memberships where room_id=m.room_id and user_id=auth.uid())
  and village_safety_private.visible(m.id,m.user_id)
 );
$$;
revoke all on function village_safety_private.media_allowed(text) from public;
grant usage on schema village_safety_private to anon;
grant execute on function village_safety_private.media_allowed(text) to anon,authenticated;
create policy village_media_safety on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'village-audio' or village_safety_private.media_allowed(name));
drop policy if exists "Public can read village media" on storage.objects;
drop policy if exists "Public can read audio" on storage.objects;
create policy village_media_member_read on storage.objects for select to authenticated using(bucket_id='village-audio');
commit;
