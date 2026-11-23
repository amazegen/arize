-- Fictional accounts in the disposable local native database only.
insert into auth.users(id,email) values
 ('73000000-0000-4000-8000-000000000001','native@example.test'),
 ('73000000-0000-4000-8000-000000000002','other@example.test'),
 ('73000000-0000-4000-8000-000000000003','setup@example.test'),
 ('73000000-0000-4000-8000-000000000004','delete@example.test') on conflict do nothing;
update public.profiles set name=case when id='73000000-0000-4000-8000-000000000001' then 'Local Arize Reviewer' else 'Fictional Reviewer' end,onboarded=true where id::text like '73000000-%' and id<>'73000000-0000-4000-8000-000000000003';
insert into public.legal_consents(user_id,terms_version,privacy_version) select id,'2.0','2.0' from auth.users where id::text like '73000000-%' and id<>'73000000-0000-4000-8000-000000000003' on conflict do nothing;
insert into native_private.ai_consents(user_id,version) values('73000000-0000-4000-8000-000000000001','adult-native-ai-2026-11-22') on conflict do nothing;
insert into public.village_rooms(id,name,description) values('74000000-0000-4000-8000-000000000001','Local Review Room','Fictional local text chat. No real community members.') on conflict do nothing;
insert into public.goals(id,user_id,title,category,week_of,is_complete,progress) values('75000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','Keep a completed goal complete','Wellness',date_trunc('week',current_date+1)::date-1,true,100) on conflict do nothing;
