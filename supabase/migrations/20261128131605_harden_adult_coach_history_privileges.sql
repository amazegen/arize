-- Explicitly narrow hosted default grants; preserve owner RLS and app workflows.
-- Adult only. No records, policies, subscriptions, or administrator assignments change.
do $$ begin
 if to_regclass('public.student_schools') is not null
 or not exists(select 1 from public.clarity_installation where edition='adult')
 then raise exception 'Adult installation required'; end if;
end $$;
alter table public.coach_conversations enable row level security;
alter table public.coach_messages enable row level security;
revoke all on public.coach_conversations,public.coach_messages from public,anon,authenticated;
grant select,insert,update,delete on public.coach_conversations to authenticated;
grant select,insert on public.coach_messages to authenticated;
grant select,insert,update,delete on public.coach_conversations,public.coach_messages to service_role;
revoke all on sequence public.coach_messages_id_seq from public,anon,authenticated;
grant usage on sequence public.coach_messages_id_seq to authenticated;
grant usage,select on sequence public.coach_messages_id_seq to service_role;
