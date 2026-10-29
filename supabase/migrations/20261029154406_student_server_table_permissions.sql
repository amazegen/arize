-- Operational release checks and trusted pilot provisioning only.
-- No grants to anon/authenticated; RLS and existing student policies are unchanged.
-- Do not use blanket ALL/schema-wide grants or copy this key into the browser.
grant usage on schema public to service_role;
grant select, insert, delete on public.student_schools to service_role;
grant select, insert, update on public.student_pilot_memberships to service_role;
-- Usage has no Auth FK; cleanup must remove only the synthetic user's counters.
grant select, delete on public.student_coach_usage to service_role;
