-- Extend only student-owned records. Existing adult data and grants are untouched.
alter table public.student_profiles add column username text
  check(username is null or username ~ '^[a-z0-9_]{3,30}$');
create unique index student_profiles_username_unique on public.student_profiles(username) where username is not null;

alter table public.student_goals
  add column week_of date generated always as (day - extract(dow from day)::integer) stored,
  add column category text not null default 'Personal' check(category in ('School','Wellness','Reflection','Personal')),
  add column deadline date,
  add column notes text not null default '' check(char_length(notes) <= 1600),
  add column progress smallint not null default 0 check(progress between 0 and 100),
  add column archived_at timestamptz;
-- Preserve the date and completion of all goals made before this migration.
update public.student_goals set deadline=day,progress=case when is_complete then 100 else 0 end;
alter table public.student_goals add constraint student_goal_deadline_week
  check(deadline is null or (deadline >= week_of and deadline < week_of + 7));
create index student_goals_week on public.student_goals(user_id,week_of,created_at) where archived_at is null;
-- Removal is reversible archival; no DELETE grant is added.

-- Meaningful saved-chat titles from the first already-saved user message.
-- No extra model call, and no title is shared with staff or other students.
update public.student_conversations c set title=coalesce((
  select left(regexp_replace(trim(m.content),'[[:space:]]+',' ','g'),72)
  from public.student_messages m where m.conversation_id=c.id and m.user_id=c.user_id and m.role='user'
  order by m.created_at,m.id limit 1
),c.title) where c.title='Clarity conversation';

create function student_admin_private.title_student_conversation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if NEW.role='user' then
    update public.student_conversations set title=left(regexp_replace(trim(NEW.content),'[[:space:]]+',' ','g'),72)
      where id=NEW.conversation_id and user_id=NEW.user_id and title='Clarity conversation';
  end if;
  return null;
end;
$$;
revoke all on function student_admin_private.title_student_conversation() from public,anon,authenticated;
create trigger student_conversation_initial_title after insert on public.student_messages
  for each row execute function student_admin_private.title_student_conversation();
