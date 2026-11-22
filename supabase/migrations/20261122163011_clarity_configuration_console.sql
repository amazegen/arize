-- Install independently in each app's database. No cross-app credentials or roles.
create schema clarity_private;
revoke all on schema clarity_private from public, anon, authenticated;
create table public.clarity_installation (
 singleton boolean primary key default true check(singleton),
 edition text not null check(edition in ('adult','student'))
);
insert into public.clarity_installation(edition)
 values(case when to_regclass('public.student_schools') is null then 'adult' else 'student' end);
create table public.clarity_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true
);
create table public.clarity_config_versions (
 id uuid primary key default gen_random_uuid(), config jsonb not null,
 created_at timestamptz not null default now(), actor_id uuid,
 actor_email text not null, note text not null check(char_length(note) between 1 and 500),
 restored_from uuid references public.clarity_config_versions(id), changed_fields text[] not null
);
create table public.clarity_config_head (
 singleton boolean primary key default true check(singleton),
 version_id uuid references public.clarity_config_versions(id)
);
insert into public.clarity_config_head default values;
create table public.clarity_config_audit (
 id bigint generated always as identity primary key,
 version_id uuid not null references public.clarity_config_versions(id),
 action text not null check(action in ('save','publish','restore')),
 actor_id uuid, actor_email text not null, created_at timestamptz not null default now()
);
create index clarity_versions_time on public.clarity_config_versions(created_at desc);
create index clarity_audit_time on public.clarity_config_audit(created_at desc);
create table public.clarity_preview_usage (
 request_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index clarity_preview_actor_time on public.clarity_preview_usage(user_id,created_at);
alter table public.clarity_preview_usage enable row level security;
revoke all on public.clarity_preview_usage from public,anon,authenticated;
alter table public.clarity_installation enable row level security;
alter table public.clarity_admins enable row level security;
alter table public.clarity_config_versions enable row level security;
alter table public.clarity_config_head enable row level security;
alter table public.clarity_config_audit enable row level security;
-- No direct browser table access. All writes go through checked transactional RPCs.
revoke all on public.clarity_installation,public.clarity_admins,public.clarity_config_versions,public.clarity_config_head,public.clarity_config_audit from public,anon,authenticated;
grant select on public.clarity_installation,public.clarity_config_versions,public.clarity_config_head,public.clarity_config_audit to service_role;
grant select,insert,update,delete on public.clarity_admins to service_role;

create function public.clarity_console_allowed(p_edition text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare allowed boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.clarity_installation where edition=p_edition) then return false; end if;
 if exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
   and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then return false; end if;
 if p_edition='student' then
   if to_regprocedure('student_admin_private.is_operator()') is null then return false; end if;
   execute 'select student_admin_private.is_operator()' into allowed;
   return coalesce(allowed,false);
 end if;
 return exists(select 1 from public.clarity_admins where user_id=auth.uid() and active);
end $$;
create function clarity_private.valid_config(c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; total integer:=0;
begin
 if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>6 then return false; end if;
 foreach k in array array['personality','tone','voiceGuidance','greetingStyle','instructions','responseBoundaries'] loop
   if jsonb_typeof(c->k) is distinct from 'string' or char_length(btrim(c->>k)) not between 1 and 2000 then return false; end if;
   total:=total+char_length(c->>k);
 end loop;
 return total<=8000;
end $$;
-- Active style contains no credentials. Only the installed edition may read it.
create function public.clarity_active_config(p_edition text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',v.id,'config',v.config) from public.clarity_config_head h
 join public.clarity_config_versions v on v.id=h.version_id
 where auth.uid() is not null and exists(select 1 from public.clarity_installation where edition=p_edition);
$$;
create function public.clarity_console_state(p_edition text,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.clarity_console_allowed(p_edition) then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid history page' using errcode='22023'; end if;
 return jsonb_build_object('edition',p_edition,'active',(select version_id from public.clarity_config_head),
 'published',(select to_jsonb(v)-'actor_id' from public.clarity_config_versions v join public.clarity_config_head h on h.version_id=v.id),
 'page',p_page,'hasMore',exists(select 1 from public.clarity_config_versions offset (p_page+1)*50 limit 1),
 'versions',coalesce((select jsonb_agg(to_jsonb(v)-'actor_id' order by v.created_at desc,v.id desc) from (select * from public.clarity_config_versions order by created_at desc,id desc limit 50 offset p_page*50) v),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(a)-'actor_id' order by a.id desc) from (select * from public.clarity_config_audit order by id desc limit 100) a),'[]'::jsonb));
end $$;
create function public.clarity_change_config(p_edition text,p_action text,p_config jsonb default null,p_note text default null,p_version uuid default null,p_expected uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare head uuid; target uuid; config jsonb; previous jsonb; actor text; fields text[];
begin
 if not public.clarity_console_allowed(p_edition) then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_action not in ('save','publish','restore') or p_action is null then raise exception 'Invalid action' using errcode='22023'; end if;
 select version_id into head from public.clarity_config_head where singleton for update;
 if p_action in ('publish','restore') and head is distinct from p_expected then raise exception 'Configuration changed. Reload before publishing.' using errcode='40001'; end if;
 select email into actor from auth.users where id=auth.uid(); actor:=coalesce(actor,auth.uid()::text);
 if p_action='publish' then
   select id into target from public.clarity_config_versions where id=p_version;
   if target is null then raise exception 'Version not found' using errcode='22023'; end if;
   if target=head then return target; end if;
 else
   if char_length(btrim(coalesce(p_note,''))) not between 1 and 500 then raise exception 'Change note required (1-500 characters)' using errcode='22023'; end if;
   if p_action='restore' then select v.config into config from public.clarity_config_versions v where id=p_version;
   else config:=p_config; end if;
   if not coalesce(clarity_private.valid_config(config),false) then raise exception 'Invalid configuration' using errcode='22023'; end if;
   select v.config into previous from public.clarity_config_versions v where id=head;
   select coalesce(array_agg(key order by key),'{}') into fields from jsonb_each(config) where previous->key is distinct from value;
   insert into public.clarity_config_versions(config,actor_id,actor_email,note,restored_from,changed_fields)
     values(config,auth.uid(),actor,btrim(p_note),case when p_action='restore' then p_version end,fields) returning id into target;
 end if;
 if p_action in ('publish','restore') then update public.clarity_config_head set version_id=target where singleton; end if;
 insert into public.clarity_config_audit(version_id,action,actor_id,actor_email) values(target,p_action,auth.uid(),actor);
 return target;
end $$;
revoke all on function clarity_private.valid_config(jsonb) from public,anon,authenticated;
revoke all on function public.clarity_console_allowed(text),public.clarity_active_config(text),public.clarity_console_state(text,integer),public.clarity_change_config(text,text,jsonb,text,uuid,uuid) from public,anon;
grant execute on function public.clarity_console_allowed(text),public.clarity_active_config(text),public.clarity_console_state(text,integer),public.clarity_change_config(text,text,jsonb,text,uuid,uuid) to authenticated;

create function public.clarity_claim_preview(p_edition text,p_request uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not public.clarity_console_allowed(p_edition) then raise exception 'Administrator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('clarity-preview/'||auth.uid()::text,0));
 delete from public.clarity_preview_usage where user_id=auth.uid() and created_at<now()-interval '1 day';
 if exists(select 1 from public.clarity_preview_usage where request_id=p_request) or
 (select count(*) from public.clarity_preview_usage where user_id=auth.uid() and created_at>=now()-interval '1 minute')>=5 or
 (select count(*) from public.clarity_preview_usage where user_id=auth.uid())>=100 then return false; end if;
 insert into public.clarity_preview_usage(request_id,user_id) values(p_request,auth.uid());
 return true;
end $$;
revoke all on function public.clarity_claim_preview(text,uuid) from public,anon;
grant execute on function public.clarity_claim_preview(text,uuid) to authenticated;
