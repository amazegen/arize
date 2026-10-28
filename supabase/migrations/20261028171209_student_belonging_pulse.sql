-- Optional private survey; school aggregation/attendance linkage is NOT enabled.
-- Application gate remains off until the school approves this collection/notice.
create table public.student_belonging_pulses (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_of date not null default (date_trunc('week', now() at time zone 'UTC')::date),
  welcome smallint check(welcome between 1 and 5),
  trusted_adult smallint check(trusted_adult between 1 and 5),
  connection smallint check(connection between 1 and 5),
  language text not null check(language in ('en','es')),
  notice_version text not null check(notice_version='belonging-pilot-2026-10-28'),
  acknowledged_at timestamptz not null default now(),
  primary key(user_id,week_of),
  check(welcome is not null or trusted_adult is not null or connection is not null),
  check(extract(isodow from week_of)=1)
);
alter table public.student_belonging_pulses enable row level security;
revoke all on public.student_belonging_pulses from public,anon,authenticated;
grant select on public.student_belonging_pulses to authenticated;
create policy student_belonging_self_read on public.student_belonging_pulses
  for select to authenticated using(user_id=(select auth.uid()) and (select public.is_active_student()));

-- Server clock and actor cannot be forged; one response per UTC week bounds writes.
create function public.student_save_belonging(p_welcome smallint,p_trusted_adult smallint,p_connection smallint,p_language text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_active_student() then raise exception 'Student access required' using errcode='42501'; end if;
  if not exists(select 1 from public.student_profiles where user_id=(select auth.uid())) then raise exception 'Onboarding required' using errcode='42501'; end if;
  insert into public.student_belonging_pulses(user_id,welcome,trusted_adult,connection,language,notice_version)
  values((select auth.uid()),p_welcome,p_trusted_adult,p_connection,p_language,'belonging-pilot-2026-10-28')
  on conflict(user_id,week_of) do update set welcome=excluded.welcome,trusted_adult=excluded.trusted_adult,
    connection=excluded.connection,language=excluded.language,acknowledged_at=now();
end;
$$;
revoke all on function public.student_save_belonging(smallint,smallint,smallint,text) from public,anon;
grant execute on function public.student_save_belonging(smallint,smallint,smallint,text) to authenticated;
