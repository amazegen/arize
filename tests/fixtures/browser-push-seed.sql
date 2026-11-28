-- Fictional LOCAL UI/HTTP accounts only.
insert into auth.users(id,email) values
 ('f3000000-0000-4000-8000-000000000001','reminder@example.test'),
 ('f3000000-0000-4000-8000-000000000002','new@example.test') on conflict do nothing;
update public.profiles set name='Fictional reminder reviewer',onboarded=true where id::text like 'f3000000-%';
update auth.users set email_confirmed_at=now() where id::text like 'f3000000-%';
insert into public.legal_consents(user_id,terms_version,privacy_version)
 select id,'2.0','2.0' from auth.users where id::text like 'f3000000-%' on conflict do nothing;
insert into public.check_ins(user_id,mood,mood_score,energy) values('f3000000-0000-4000-8000-000000000001','steady',3,5);
