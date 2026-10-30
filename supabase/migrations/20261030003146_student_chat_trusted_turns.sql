-- Only the trusted server may start provider work or persist moderated turns.
-- Request metadata contains no raw prompt. Cached replies have passed moderation.
create table public.student_ai_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 channel text not null check(channel in ('student','operator')),
 fingerprint text not null check(char_length(fingerprint)=64),
 state text not null default 'pending' check(state in ('pending','completed','blocked','failed')),
 conversation_id uuid references public.student_conversations(id) on delete cascade,
 safe_reply text check(char_length(safe_reply) between 1 and 4000),
 created_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 primary key(user_id,request_id,channel)
);
create index student_ai_requests_budget on public.student_ai_requests(user_id,channel,created_at);
alter table public.student_ai_requests enable row level security;
revoke all on public.student_ai_requests from public,anon,authenticated;
grant select,delete on public.student_ai_requests to service_role;

create function public.student_assert_ai_access(p_user uuid,p_channel text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_channel='student' then
  if not exists(select 1 from public.student_pilot_memberships m join public.student_profiles p on p.user_id=m.user_id
   where m.user_id=p_user and m.status='active' and m.consent_verified_at is not null
   and p.notice_version='student-pilot-2026-10-29-v4') then
   raise exception 'Current student enrollment and notice required' using errcode='42501';
  end if;
 elsif p_channel='operator' then
  if not exists(select 1 from public.student_operators where user_id=p_user and active) then
   raise exception 'Operator access required' using errcode='42501';
  end if;
 else raise exception 'Invalid channel' using errcode='22023'; end if;
end $$;

create function public.student_begin_ai_request(p_user uuid,p_request uuid,p_channel text,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.student_ai_requests; n integer; recent integer;
begin
 perform public.student_assert_ai_access(p_user,p_channel);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text||p_channel,1));
 select * into r from public.student_ai_requests where user_id=p_user and request_id=p_request and channel=p_channel;
 if found then
  if r.fingerprint<>p_fingerprint then raise exception 'Request changed' using errcode='22023'; end if;
  return jsonb_build_object('state',r.state,'conversationId',r.conversation_id,'content',r.safe_reply);
 end if;
 if exists(select 1 from public.student_ai_requests where user_id=p_user and channel=p_channel and state='pending' and created_at>clock_timestamp()-interval '60 seconds') then
  raise exception 'Another message is still processing' using errcode='55P03';
 end if;
 select count(*),count(*) filter(where created_at>clock_timestamp()-interval '1 minute') into n,recent
  from public.student_ai_requests where user_id=p_user and channel=p_channel and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 if n >= (case when p_channel='operator' then 100 else 60 end) or recent>=10 then
  raise exception 'Request limit reached' using errcode='P0002';
 end if;
 insert into public.student_ai_requests(user_id,request_id,channel,fingerprint) values(p_user,p_request,p_channel,p_fingerprint);
 return jsonb_build_object('state','new');
end $$;

create function public.student_store_approved_turn(p_user uuid,p_request uuid,p_conversation uuid,p_content text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.student_ai_requests; v_id uuid:=p_conversation; u public.student_coach_usage;
begin
 perform public.student_assert_ai_access(p_user,'student');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text||'student',1));
 select * into r from public.student_ai_requests where user_id=p_user and request_id=p_request and channel='student' for update;
 if not found or r.state<>'pending' or r.created_at<clock_timestamp()-interval '60 seconds' then raise exception 'Request expired' using errcode='22023'; end if;
 if r.conversation_id is not null then return r.conversation_id; end if;
 if char_length(trim(p_content)) not between 1 and 2000 then raise exception 'Invalid message' using errcode='22023'; end if;
 if v_id is not null and not exists(select 1 from public.student_conversations where id=v_id and user_id=p_user) then raise exception 'Conversation not found' using errcode='42501'; end if;
 insert into public.student_coach_usage(user_id,day) values(p_user,current_date) on conflict do nothing;
 select * into u from public.student_coach_usage where user_id=p_user and day=current_date for update;
 if u.count>=30 or(u.minute_start>now()-interval '1 minute' and u.minute_count>=5) then raise exception 'Message limit reached' using errcode='P0002'; end if;
 if v_id is null then insert into public.student_conversations(user_id,title) values(p_user,left(trim(p_content),70)) returning id into v_id; end if;
 update public.student_coach_usage set count=count+1,minute_count=case when minute_start<=now()-interval '1 minute' then 1 else minute_count+1 end,
  minute_start=case when minute_start<=now()-interval '1 minute' then now() else minute_start end where user_id=p_user and day=current_date;
 insert into public.student_messages(conversation_id,user_id,role,content) values(v_id,p_user,'user',trim(p_content));
 update public.student_ai_requests set conversation_id=v_id where user_id=p_user and request_id=p_request and channel='student';
 return v_id;
end $$;

create function public.student_finish_ai_request(p_user uuid,p_request uuid,p_channel text,p_state text,p_reply text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.student_ai_requests;
begin
 perform public.student_assert_ai_access(p_user,p_channel);
 select * into r from public.student_ai_requests where user_id=p_user and request_id=p_request and channel=p_channel for update;
 if not found then raise exception 'Request not found' using errcode='22023'; end if;
 if r.state<>'pending' then return; end if;
 if p_state<>'failed' and r.created_at<clock_timestamp()-interval '60 seconds' then raise exception 'Request expired' using errcode='22023'; end if;
 if p_state not in ('completed','blocked','failed') or (p_state<>'failed' and (p_reply is null or char_length(p_reply) not between 1 and 4000)) then raise exception 'Invalid result' using errcode='22023'; end if;
 if p_state='completed' and p_channel='student' then
  if r.conversation_id is null then raise exception 'Missing conversation' using errcode='22023'; end if;
  insert into public.student_messages(conversation_id,user_id,role,content) values(r.conversation_id,p_user,'assistant',p_reply);
 end if;
 update public.student_ai_requests set state=p_state,safe_reply=case when p_state='failed' then null else p_reply end,finished_at=clock_timestamp()
  where user_id=p_user and request_id=p_request and channel=p_channel;
end $$;

revoke all on function public.student_assert_ai_access(uuid,text) from public,anon,authenticated;
revoke all on function public.student_begin_ai_request(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.student_store_approved_turn(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.student_finish_ai_request(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.student_begin_ai_request(uuid,uuid,text,text),public.student_store_approved_turn(uuid,uuid,uuid,text),public.student_finish_ai_request(uuid,uuid,text,text,text) to service_role;
-- Remove the legacy browser-write shortcut; private history remains readable.
revoke all on function public.student_reserve_coach_turn(uuid,text) from public,anon,authenticated;
