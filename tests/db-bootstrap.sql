-- Disposable LOCAL PostgreSQL only. This simulates Supabase roles and schemas;
-- it is not a replacement for a real sandbox end-to-end test.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;
end $$;
create publication supabase_realtime;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
create schema storage;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant all on storage.objects to authenticated,service_role;
create policy fixture_owned_insert on storage.objects for insert to authenticated with check(owner_id=auth.uid()::text);
