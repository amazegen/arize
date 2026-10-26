-- Narrow staff permission: manage this school's notification destination only.
-- This does not grant access to individual student chats, goals, or check-ins.
create table public.student_notification_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.student_schools(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.student_notification_admins enable row level security;
revoke all on public.student_notification_admins from public, anon, authenticated;
grant select on public.student_notification_admins to authenticated;
grant all on public.student_notification_admins to service_role;
create policy student_notification_admin_self on public.student_notification_admins for select to authenticated
  using(user_id = (select auth.uid()) and active);

create schema if not exists student_admin_private;
revoke all on schema student_admin_private from public, anon;
grant usage on schema student_admin_private to authenticated;
create function student_admin_private.manages_notifications(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.student_notification_admins
    where user_id = (select auth.uid()) and school_id = p_school_id and active);
$$;
revoke all on function student_admin_private.manages_notifications(uuid) from public, anon;
grant execute on function student_admin_private.manages_notifications(uuid) to authenticated;

create table public.student_counselor_settings (
  school_id uuid primary key references public.student_schools(id),
  recipient_email text not null check(char_length(recipient_email) <= 254
    and recipient_email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table public.student_counselor_email_audit (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.student_schools(id),
  old_email text,
  new_email text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
alter table public.student_counselor_settings enable row level security;
alter table public.student_counselor_email_audit enable row level security;
revoke all on public.student_counselor_settings, public.student_counselor_email_audit from public, anon, authenticated;
grant select on public.student_counselor_settings, public.student_counselor_email_audit to authenticated;
grant insert(school_id, recipient_email), update(recipient_email) on public.student_counselor_settings to authenticated;
grant all on public.student_counselor_settings to service_role;
grant select on public.student_counselor_email_audit to service_role;
create policy student_counselor_settings_admin_read on public.student_counselor_settings for select to authenticated
  using((select student_admin_private.manages_notifications(school_id)));
create policy student_counselor_settings_admin_insert on public.student_counselor_settings for insert to authenticated
  with check((select student_admin_private.manages_notifications(school_id)));
create policy student_counselor_settings_admin_update on public.student_counselor_settings for update to authenticated
  using((select student_admin_private.manages_notifications(school_id)))
  with check((select student_admin_private.manages_notifications(school_id)));
create policy student_counselor_audit_admin_read on public.student_counselor_email_audit for select to authenticated
  using((select student_admin_private.manages_notifications(school_id)));
create policy student_school_notification_admin_read on public.student_schools for select to authenticated
  using((select student_admin_private.manages_notifications(id)));

-- Separate BEFORE stamping from AFTER auditing: ON CONFLICT must not produce
-- both an attempted-insert audit and an update audit for the same change.
create function student_admin_private.stamp_counselor_email() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  NEW.recipient_email := lower(trim(NEW.recipient_email));
  if TG_OP = 'UPDATE' then
    if NEW.recipient_email = OLD.recipient_email then return OLD; end if;
  end if;
  NEW.updated_by := (select auth.uid());
  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function student_admin_private.stamp_counselor_email() from public, anon, authenticated;
create trigger student_counselor_email_stamp before insert or update on public.student_counselor_settings
  for each row execute function student_admin_private.stamp_counselor_email();

-- Atomic, immutable audit. Callers cannot supply the actor/time or edit history.
create function student_admin_private.audit_counselor_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if TG_OP = 'UPDATE' then
    if NEW.recipient_email = OLD.recipient_email then return null; end if;
    v_old := OLD.recipient_email;
  end if;
  insert into public.student_counselor_email_audit(school_id, old_email, new_email, changed_by)
    values(NEW.school_id, v_old, NEW.recipient_email, NEW.updated_by);
  return null;
end;
$$;
revoke all on function student_admin_private.audit_counselor_email() from public, anon, authenticated;
create trigger student_counselor_email_changed after insert or update on public.student_counselor_settings
  for each row execute function student_admin_private.audit_counselor_email();

create function public.student_save_counselor_email(p_email text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_school uuid; v_setting public.student_counselor_settings;
begin
  select school_id into v_school from public.student_notification_admins
    where user_id = (select auth.uid()) and active;
  if v_school is null then raise exception 'Notification administrator access required' using errcode = '42501'; end if;
  insert into public.student_counselor_settings(school_id, recipient_email)
    values(v_school, lower(trim(p_email)))
    on conflict(school_id) do update set recipient_email = excluded.recipient_email
    returning * into v_setting;
  return pg_catalog.jsonb_build_object('email',v_setting.recipient_email,'updatedAt',v_setting.updated_at);
end;
$$;
revoke all on function public.student_save_counselor_email(text) from public, anon;
grant execute on function public.student_save_counselor_email(text) to authenticated;

-- Freeze each request's delivery address on the server. Ordinary student SELECT
-- grants are column-specific and deliberately do not include this new column.
alter table public.student_counselor_requests add column recipient_email text;
