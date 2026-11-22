-- Fictional local UI data only, never a migration or real pilot seed.
\set ON_ERROR_STOP on
insert into auth.users(id,email,created_at,raw_user_meta_data) values
 ('d1000000-0000-4000-8000-000000000001','founder@example.test',now()-interval '100 days','{"full_name":"Fictional Founder"}'),
 ('d1000000-0000-4000-8000-000000000002','ordinary@example.test',now()-interval '50 days','{"full_name":"Fictional Member"}');
insert into public.founder_admins(user_id) values('d1000000-0000-4000-8000-000000000001');
insert into auth.users(id,email,created_at)
 select md5('founder-fixture-'||i)::uuid,'fictional-'||i||'@example.test',now()-make_interval(days=>i)
 from generate_series(1,60) i;
update public.profiles set onboarded=true;
update public.founder_reporting_installation set capture_started_at=now()-interval '100 days';
insert into public.check_ins(user_id,mood,mood_score,energy,created_at)
 select md5('founder-fixture-'||i)::uuid,'steady',3,5,now()-make_interval(days=>d,hours=>1)
 from generate_series(1,40) i cross join generate_series(0,50) d where (i+d)%5=0 and d<=i;
insert into public.goals(user_id,title,created_at)
 select md5('founder-fixture-'||i)::uuid,'Fictional local goal',now()-make_interval(days=>i%20) from generate_series(1,25) i;
insert into public.coach_conversations(id,user_id,title)
 select md5('founder-chat-'||i)::uuid,md5('founder-fixture-'||i)::uuid,'Fictional local conversation' from generate_series(1,18) i;
insert into public.coach_messages(conversation_id,user_id,role,content,created_at)
 select md5('founder-chat-'||i)::uuid,md5('founder-fixture-'||i)::uuid,'user','Fictional local test text',now()-make_interval(days=>i%12) from generate_series(1,18) i;
insert into public.access_grants(user_id,plan,source,status,starts_at,ends_at,external_reference,metadata)
 select md5('founder-fixture-'||i)::uuid,'plus',case when i>12 then 'checkout_trial' else 'subscription' end,'active',now()-interval '20 days',now()+interval '20 days','sub_fictional_'||i,
 jsonb_build_object('provider','stripe','livemode',false,'stripe_status',case when i>12 then 'trialing' else 'active' end,'billing_period',case when i%3=0 then 'annual' else 'monthly' end)
 from generate_series(1,16) i;
insert into public.founder_subscription_facts(subscription_id,user_id,livemode,billing_period,trial_started_at,trial_ends_at,first_paid_at)
 select 'sub_fictional_'||i,md5('founder-fixture-'||i)::uuid,false,'monthly',now()-interval '25 days',now()-interval '18 days',case when i<=6 then now()-interval '17 days' else null end
 from generate_series(1,8) i;
