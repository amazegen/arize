-- Privacy workflows do not automatically erase data or expose chats to staff.
create table public.student_privacy_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('access','correction','deletion','withdrawal')),
 status text not null default 'received' check(status in ('received','in_review','awaiting_owner','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index student_privacy_queue on public.student_privacy_requests(created_at desc,id desc);
create index student_privacy_owner on public.student_privacy_requests(user_id,created_at desc);
create table public.student_privacy_audit (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.student_privacy_requests(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,status text not null,
 review_reference text not null check(char_length(review_reference) between 3 and 200),created_at timestamptz not null default now()
);
create table public.student_export_sessions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), pages integer not null default 0
);
create index student_export_owner on public.student_export_sessions(user_id,created_at desc);
alter table public.student_privacy_requests enable row level security;
alter table public.student_privacy_audit enable row level security;
alter table public.student_export_sessions enable row level security;
revoke all on public.student_privacy_requests,public.student_privacy_audit,public.student_export_sessions from public,anon,authenticated;

create function public.student_privacy_self() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not exists(select 1 from public.student_pilot_memberships where user_id=(select auth.uid())) then raise exception 'Student account required' using errcode='42501'; end if;
 return jsonb_build_object('requests',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from
  (select id,kind,status,created_at,updated_at from public.student_privacy_requests where user_id=(select auth.uid()) order by created_at desc,id desc limit 100)q));
end $$;
create function public.student_request_privacy(p_kind text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); r uuid;
begin
 if u is null or not exists(select 1 from public.student_pilot_memberships where user_id=u) then raise exception 'Student account required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('access','correction','deletion','withdrawal') then raise exception 'Invalid request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,4));
 select id into r from public.student_privacy_requests where user_id=u and kind=p_kind and status<>'closed' limit 1;
 if r is not null then return r; end if;
 if (select count(*) from public.student_privacy_requests where user_id=u and created_at>now()-interval '1 day')>=4 then raise exception 'Request limit reached' using errcode='P0002'; end if;
 insert into public.student_privacy_requests(user_id,kind) values(u,p_kind) returning id into r;
 return r;
end $$;
create function public.student_review_privacy(p_request uuid,p_status text,p_reference text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('in_review','awaiting_owner','closed') or p_reference is null or char_length(trim(p_reference)) not between 3 and 200 then raise exception 'Verified review reference required' using errcode='22023'; end if;
 update public.student_privacy_requests set status=p_status,updated_at=now() where id=p_request;
 if not found then raise exception 'Request not found' using errcode='22023'; end if;
 insert into public.student_privacy_audit(request_id,actor_id,status,review_reference) values(p_request,(select auth.uid()),p_status,trim(p_reference));
end $$;
create function public.student_privacy_queue(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not student_admin_private.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select r.id,r.kind,r.status,r.created_at,r.updated_at,u.email
 from public.student_privacy_requests r join auth.users u on u.id=r.user_id
 where p_before is null or (r.created_at,r.id)<(p_before,p_before_id) order by r.created_at desc,r.id desc limit 51)q);
end $$;

create function public.student_start_export() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); r uuid;
begin
 if u is null or not exists(select 1 from public.student_pilot_memberships where user_id=u) then raise exception 'Student account required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,5));
 if(select count(*) from public.student_export_sessions where user_id=u and created_at>now()-interval '1 day')>=5 then raise exception 'Export limit reached' using errcode='P0002'; end if;
 insert into public.student_export_sessions(user_id) values(u) returning id into r;
 return r;
end $$;
create function public.student_export_page(p_export uuid,p_section text,p_after text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); t text; k text; d text:='to_jsonb(t)-''user_id'''; owner_col text:='user_id'; fields text[]; result jsonb;
begin
 if u is null or not exists(select 1 from public.student_pilot_memberships where user_id=u) then raise exception 'Student account required' using errcode='42501'; end if;
 update public.student_export_sessions set pages=pages+1 where id=p_export and user_id=u and created_at>now()-interval '15 minutes' and pages<2000;
 if not found then raise exception 'Export session unavailable' using errcode='42501'; end if;
 if char_length(coalesce(p_after,''))>150 then raise exception 'Invalid cursor' using errcode='22023'; end if;
 -- Only these fixed sources/columns can be selected. No caller supplies SQL.
 case p_section
 when 'profile' then t:='student_profiles';k:='user_id::text';fields:=array['display_name','username','grade','notice_version','acknowledged_at','reporting_ack_at'];
 when 'enrollment' then t:='student_pilot_memberships';k:='user_id::text';fields:=array['school_id','role','status','consent_verified_at','created_at'];
 when 'checkIns' then t:='student_check_ins';k:='id::text';fields:=array['id','day','score','created_at'];
 when 'goals' then t:='student_goals';k:='id::text';fields:=array['id','title','day','week_of','category','deadline','notes','progress','is_complete','archived_at','created_at'];
 when 'conversations' then t:='student_conversations';k:='id::text';fields:=array['id','title','created_at'];
 when 'messages' then t:='student_messages';k:='id::text';fields:=array['id','conversation_id','role','content','created_at'];
 when 'counselorRequests' then t:='student_counselor_requests';k:='id::text';d:='to_jsonb(t)-''user_id''-''recipient_email''-''provider_message_id''';fields:=array['id','school_id','display_name','status','created_at','sent_at'];
 when 'belonging' then t:='student_belonging_pulses';k:='week_of::text';fields:=array['week_of','welcome','trusted_adult','connection','language','notice_version','acknowledged_at'];
 when 'topics' then t:='student_topic_choices';k:='week_of::text||''/''||topic';fields:=array['week_of','topic','notice_version','recorded_at'];
 when 'coachUsage' then t:='student_coach_usage';k:='day::text';fields:=array['day','count','minute_start','minute_count'];
 when 'aiRequests' then t:='student_ai_requests';k:='request_id::text||''/''||channel';d:='to_jsonb(t)-''user_id''-''fingerprint''';fields:=array['request_id','channel','state','conversation_id','safe_reply','created_at','finished_at'];
 when 'privacyRequests' then t:='student_privacy_requests';k:='id::text';fields:=array['id','kind','status','created_at','updated_at'];
 when 'enrollmentHistory' then t:='student_enrollment_audit';k:='id::text';owner_col:='student_id';d:='to_jsonb(t)-''student_id''-''operator_id''-''review_reference''';fields:=array['id','school_id','status','created_at'];
 else raise exception 'Invalid section' using errcode='22023'; end case;
 d:='(select coalesce(jsonb_object_agg(e.key,e.value),''{}''::jsonb) from jsonb_each(to_jsonb(t)) e where e.key=any($3))';
 execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(q) order by q.cursor),''[]''::jsonb) from(select %s as cursor,%s as data from public.%I t where %I=$1 and (%s)>$2 order by %s limit 51)q',k,d,t,owner_col,k,k)
 into result using u,coalesce(p_after,''),fields;
 return result;
end $$;
revoke all on function public.student_privacy_self(),public.student_request_privacy(text),public.student_review_privacy(uuid,text,text),public.student_privacy_queue(timestamptz,uuid),public.student_start_export(),public.student_export_page(uuid,text,text) from public,anon;
grant execute on function public.student_privacy_self(),public.student_request_privacy(text),public.student_review_privacy(uuid,text,text),public.student_privacy_queue(timestamptz,uuid),public.student_start_export(),public.student_export_page(uuid,text,text) to authenticated;
