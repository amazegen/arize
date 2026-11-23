-- ADULT ONLY. Local preparation; install only after separate approval.
do $$ begin
 if to_regclass('public.student_schools') is not null or not exists(select 1 from public.clarity_installation where edition='adult')
 then raise exception 'Adult native gateway cannot be installed on Student' using errcode='42501';end if;
end $$;
create schema native_private;
revoke all on schema native_private from public,anon,authenticated;
grant usage on schema native_private to authenticated,service_role;
create table native_private.ai_consents (
 user_id uuid primary key references auth.users(id) on delete cascade,
 version text not null check(version='adult-native-ai-2026-11-22'), accepted_at timestamptz not null default now()
);
alter table native_private.ai_consents enable row level security;
revoke all on native_private.ai_consents from public,anon,authenticated;
grant select,insert,update,delete on native_private.ai_consents to service_role;

-- Auth.users lookup alone does not invalidate a signed-out JWT. Check the real
-- Auth session too. No user-editable metadata is used for authorization.
create function native_private.context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid;started timestamptz;p public.profiles;
begin
 if u is null or to_regclass('public.student_schools') is not null then return null;end if;
 if coalesce(auth.jwt()->>'session_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then return null;end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 select created_at into started from auth.sessions where id=s and user_id=u and (not_after is null or not_after>now());
 if started is null then return null;end if;
 select * into p from public.profiles where id=u;
 if not found then return null;end if;
 return jsonb_build_object('sessionId',s,'startedAt',started,
  'profile',jsonb_build_object('name',p.name,'username',p.username,'onboarded',coalesce(p.onboarded,false)),
  'consented',exists(select 1 from public.legal_consents where user_id=u and terms_version='2.0' and privacy_version='2.0'),
  'aiConsented',exists(select 1 from native_private.ai_consents where user_id=u and version='adult-native-ai-2026-11-22'),
  'deleting',exists(select 1 from public.account_deletion_jobs where user_id=u),
  'needsMfa',exists(select 1 from auth.mfa_factors where user_id=u and status='verified') and coalesce(auth.jwt()->>'aal','aal1')<>'aal2');
end $$;
revoke all on function native_private.context() from public,anon;
grant execute on function native_private.context() to authenticated;
create function public.native_session_context() returns jsonb
language sql stable security invoker set search_path='' as $$select native_private.context();$$;
revoke all on function public.native_session_context() from public,anon;
grant execute on function public.native_session_context() to authenticated;

create function native_private.accept_ai() returns boolean
language plpgsql security definer set search_path='' as $$
declare ctx jsonb:=native_private.context();begin
 if ctx is null or ctx->>'consented'<>'true' or ctx->>'deleting'='true' or ctx->>'needsMfa'='true'
 then raise exception 'Verified active account and legal acceptance required' using errcode='42501';end if;
 insert into native_private.ai_consents(user_id,version) values(auth.uid(),'adult-native-ai-2026-11-22') on conflict(user_id) do nothing;
 return true;
end $$;
revoke all on function native_private.accept_ai() from public,anon;
grant execute on function native_private.accept_ai() to authenticated;
create function public.native_accept_ai_disclosure() returns boolean
language sql security invoker set search_path='' as $$select native_private.accept_ai();$$;
revoke all on function public.native_accept_ai_disclosure() from public,anon;
grant execute on function public.native_accept_ai_disclosure() to authenticated;

-- Service callers do not need broad SELECT access to Supabase-owned Auth
-- tables. Expose only a fixed ownership/expiry check through this private helper.
create function native_private.active_session(p_user uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id=p_session and s.user_id=p_user and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function native_private.active_session(uuid,uuid) from public,anon,authenticated;
grant execute on function native_private.active_session(uuid,uuid) to service_role;

-- Request ledger stores no unchecked input. Only the verified server can finish
-- a turn after the locked input/output checks, and history is committed atomically.
create table native_private.coach_turns (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, conversation_id uuid,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'processing' check(status in ('processing','done','failed')),
 token uuid not null default gen_random_uuid(), lease_until timestamptz not null default now()+interval '2 minutes',
 attempts integer not null default 1 check(attempts between 1 and 3),
 reply text, blocked boolean, created_at timestamptz not null default now(),
 primary key(user_id,request_id),check(status<>'done' or (reply is not null and blocked is not null))
);
alter table native_private.coach_turns enable row level security;
revoke all on native_private.coach_turns from public,anon,authenticated;
grant select,insert,update,delete on native_private.coach_turns to service_role;
create function public.native_claim_turn(p_user uuid,p_session uuid,p_request uuid,p_conversation uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r native_private.coach_turns;begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult only' using errcode='42501';end if;
 if not native_private.active_session(p_user,p_session) then raise exception 'Session revoked' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,71));
 delete from native_private.coach_turns where user_id=p_user and created_at<now()-interval '14 days';
 select * into r from native_private.coach_turns where user_id=p_user and request_id=p_request for update;
 if found then
  if r.input_hash<>p_hash or r.conversation_id is distinct from p_conversation then return jsonb_build_object('error','changed');end if;
  if r.status='done' then return jsonb_build_object('reply',r.reply,'blocked',r.blocked,'conversationId',case when r.blocked then null else r.conversation_id end);end if;
  if (r.status='processing' and r.lease_until>now()) or r.attempts>=3 then return jsonb_build_object('error','busy');end if;
  update native_private.coach_turns set status='processing',attempts=attempts+1,token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where user_id=p_user and request_id=p_request returning * into r;
 else
  if (select count(*) from native_private.coach_turns where user_id=p_user and created_at>now()-interval '1 day')>=300 then return jsonb_build_object('error','limit');end if;
  insert into native_private.coach_turns(user_id,request_id,conversation_id,input_hash) values(p_user,p_request,p_conversation,p_hash) returning * into r;
 end if;
 return jsonb_build_object('token',r.token);
end $$;
create function public.native_finish_turn(p_user uuid,p_session uuid,p_request uuid,p_token uuid,p_input text,p_reply text,p_blocked boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r native_private.coach_turns;begin
 if to_regclass('public.student_schools') is not null then raise exception 'Adult only' using errcode='42501';end if;
 if not native_private.active_session(p_user,p_session) then return false;end if;
 select * into r from native_private.coach_turns where user_id=p_user and request_id=p_request and token=p_token and status='processing' and lease_until>now() for update;
 if not found then return false;end if;
 if exists(select 1 from public.account_deletion_jobs where user_id=p_user) then return false;end if;
 if not exists(select 1 from native_private.ai_consents where user_id=p_user and version='adult-native-ai-2026-11-22')
 or not exists(select 1 from public.legal_consents where user_id=p_user and terms_version='2.0' and privacy_version='2.0') then return false;end if;
 if p_reply is null then update native_private.coach_turns set status='failed' where user_id=p_user and request_id=p_request;return true;end if;
 if length(p_reply) not between 1 and 8000 then raise exception 'Invalid checked reply';end if;
 if not p_blocked then
  if length(p_input) not between 1 and 4000 or r.conversation_id is null then raise exception 'Invalid checked input';end if;
  if exists(select 1 from public.coach_conversations where id=r.conversation_id and user_id<>p_user) then raise exception 'Owner mismatch' using errcode='42501';end if;
  insert into public.coach_conversations(id,user_id,title) values(r.conversation_id,p_user,left(regexp_replace(p_input,'\s+',' ','g'),72)) on conflict(id) do nothing;
  insert into public.coach_messages(conversation_id,user_id,role,content) values(r.conversation_id,p_user,'user',p_input),(r.conversation_id,p_user,'assistant',p_reply);
  update public.coach_conversations set updated_at=now() where id=r.conversation_id and user_id=p_user;
 end if;
 update native_private.coach_turns set status='done',reply=p_reply,blocked=p_blocked where user_id=p_user and request_id=p_request;
 return true;
end $$;
revoke all on function public.native_claim_turn(uuid,uuid,uuid,uuid,text),public.native_finish_turn(uuid,uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.native_claim_turn(uuid,uuid,uuid,uuid,text),public.native_finish_turn(uuid,uuid,uuid,uuid,text,text,boolean) to service_role;
