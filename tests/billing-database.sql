\set ON_ERROR_STOP on
begin;
-- Match Supabase's application grants before testing the restrictive policies.
grant usage on schema public to authenticated,service_role;
grant select,insert,update,delete on public.profiles,public.goals,public.check_ins,public.friday_reflections,public.village_rooms,public.village_memberships,public.village_messages,public.coach_conversations,public.coach_messages to authenticated;
grant usage,select on all sequences in schema public to authenticated,service_role;
grant all on all tables in schema public to service_role;
grant all on auth.users to service_role;
insert into auth.users(id) values('0d6e5bed-2a98-4c8a-a588-6c835370513a'),('1d6e5bed-2a98-4c8a-a588-6c835370513a');
update public.membership_launch set enabled=true,stripe_mode='test';
insert into public.billing_customers(user_id,stripe_customer_id) values('0d6e5bed-2a98-4c8a-a588-6c835370513a','cus_fixture');
insert into public.check_ins(user_id,mood,mood_score,energy,created_at) values
 ('0d6e5bed-2a98-4c8a-a588-6c835370513a','steady',3,5,now()-interval '14 days'),
 ('0d6e5bed-2a98-4c8a-a588-6c835370513a','steady',3,5,now());
insert into public.coach_conversations(user_id,title,updated_at) select '0d6e5bed-2a98-4c8a-a588-6c835370513a','conversation '||i,now()-i*interval '1 day' from generate_series(1,5)i;
insert into public.coach_messages(user_id,conversation_id,role,content) select user_id,id,'user','Disposable fixture' from public.coach_conversations;
insert into public.legal_consents(user_id,terms_version,privacy_version) values('0d6e5bed-2a98-4c8a-a588-6c835370513a','2.0','2.0');
insert into public.friday_reflections(user_id,content,week_of) values('0d6e5bed-2a98-4c8a-a588-6c835370513a','Disposable fixture',current_date);
set local role authenticated;
set local request.jwt.claim.sub='0d6e5bed-2a98-4c8a-a588-6c835370513a';
do $$ begin
 if (select count(*) from public.profiles)<>1 then raise exception 'Cross-account profile leak';end if;
 if (select count(*) from public.check_ins)<>1 then raise exception 'Core history limit failed';end if;
 if (select count(*) from public.coach_conversations)<>3 then raise exception 'Core chat history failed';end if;
 if (select count(*) from public.coach_messages)<>3 then raise exception 'Core message history failed';end if;
 begin perform public.claim_billing_operation(auth.uid(),gen_random_uuid());raise exception 'Authenticated user acquired server lease';exception when insufficient_privilege then null;end;
 begin insert into public.access_grants(user_id,plan,source) values(auth.uid(),'plus','admin');raise exception 'Self-upgrade succeeded';exception when insufficient_privilege then null;end;
 perform public.join_village_room((select id from public.village_rooms where name='Wins Only' limit 1));
 begin perform public.join_village_room((select id from public.village_rooms where name='Manager Mode' limit 1));raise exception 'Core joined premium room';exception when insufficient_privilege then null;end;
 insert into public.goals(user_id,title,week_of) select auth.uid(),'goal '||i,current_date from generate_series(1,3)i;
 begin insert into public.goals(user_id,title,week_of) values(auth.uid(),'fourth',current_date);raise exception 'Fourth Core goal accepted';exception when raise_exception then if sqlerrm<>'Core includes three active goals' then raise;end if;end;
 for i in 1..5 loop if (public.consume_coach_quota_for_plan(30,300)->>'allowed')::boolean is not true then raise exception 'Core quota too small';end if;end loop;
 if (public.consume_coach_quota_for_plan(30,300)->>'allowed')::boolean then raise exception 'Core quota self-upgrade succeeded';end if;
 begin insert into storage.objects(bucket_id,name,owner_id) values('village-audio',auth.uid()::text||'/blocked',auth.uid()::text);raise exception 'Core uploaded media';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare token uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); u uuid:='0d6e5bed-2a98-4c8a-a588-6c835370513a'; g jsonb;begin
 if not public.claim_billing_operation(u,token) then raise exception 'Lease claim failed';end if;
 if public.claim_billing_operation(u,other) then raise exception 'Concurrent claim succeeded';end if;
 perform public.release_billing_operation(u,other);
 if public.claim_billing_operation(u,other) then raise exception 'Wrong token released lease';end if;
 g:=jsonb_build_object('user_id',u,'plan','plus','source','subscription','status','active','starts_at',now()-interval '1 day','ends_at',now()+interval '1 month','external_reference','sub_fixture','metadata',jsonb_build_object('stripe_customer_id','cus_fixture','stripe_status','active','cancel_at_period_end',false,'livemode',false));
 begin perform public.apply_billing_access(u,other,g);raise exception 'Wrong lease wrote grant';exception when sqlstate '55000' then null;end;
 if not public.apply_billing_access(u,token,g) then raise exception 'Valid grant apply failed';end if;
 perform public.release_billing_operation(u,token);
 if public.claim_billing_webhook_v2('evt_fixture','invoice.paid',false,token)<>'claimed' then raise exception 'Webhook claim failed';end if;
 if public.claim_billing_webhook_v2('evt_fixture','invoice.paid',false,other)<>'busy' then raise exception 'Busy webhook not retried';end if;
 if public.finish_billing_webhook_v2('evt_fixture',other,null) then raise exception 'Wrong webhook token completed';end if;
 if not public.finish_billing_webhook_v2('evt_fixture',token,null) then raise exception 'Webhook completion failed';end if;
 if public.claim_billing_webhook_v2('evt_fixture','invoice.paid',false,other)<>'processed' then raise exception 'Duplicate webhook not recognized';end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 if not arize_billing_private.has_plus() then raise exception 'Verified Plus not recognized';end if;
 if (select count(*) from public.check_ins)<>2 then raise exception 'Plus history unavailable';end if;
 if (select count(*) from public.coach_conversations)<>5 then raise exception 'Plus history unavailable';end if;
 if (select count(*) from public.coach_messages)<>5 then raise exception 'Plus message history unavailable';end if;
 insert into public.goals(user_id,title,week_of) values(auth.uid(),'fourth Plus goal',current_date);
 perform public.join_village_room((select id from public.village_rooms where name='Manager Mode' limit 1));
 insert into storage.objects(bucket_id,name,owner_id) values('village-audio',auth.uid()::text||'/allowed',auth.uid()::text);
end $$;
reset role;
update public.membership_launch set stripe_mode='live';
set local role authenticated;
do $$ begin if arize_billing_private.has_plus() then raise exception 'Test grant unlocked live billing';end if;end $$;
reset role;
update public.membership_launch set stripe_mode='test';
insert into public.account_deletion_jobs(user_id) values('0d6e5bed-2a98-4c8a-a588-6c835370513a');
set local role authenticated;
do $$ begin
 if (select count(*) from public.profiles)<>0 then raise exception 'Pending deletion can read profile';end if;
 if (select count(*) from public.account_deletion_jobs)<>1 then raise exception 'Deletion retry unavailable';end if;
 begin perform public.consume_coach_quota();raise exception 'Deleting user consumed quota';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from storage.objects where owner_id='0d6e5bed-2a98-4c8a-a588-6c835370513a';
delete from auth.users where id='0d6e5bed-2a98-4c8a-a588-6c835370513a';
set local role authenticated;
do $$ begin
 if arize_billing_private.account_active() then raise exception 'Deleted identity retained active access';end if;
 begin insert into storage.objects(bucket_id,name,owner_id) values('village-audio',auth.uid()::text||'/old-token',auth.uid()::text);raise exception 'Deleted identity uploaded media';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.goals where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a')
 or exists(select 1 from public.check_ins where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a')
 or exists(select 1 from public.coach_requests where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a')
 or exists(select 1 from public.coach_messages where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a')
 or exists(select 1 from public.legal_consents where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a')
 or exists(select 1 from public.friday_reflections where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a')
 or exists(select 1 from public.access_grants where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a')
 then raise exception 'Owned app records failed to cascade';end if;
 if not exists(select 1 from public.profiles where id='1d6e5bed-2a98-4c8a-a588-6c835370513a') then raise exception 'Other account was deleted';end if;
 if exists(select 1 from public.profiles where id='0d6e5bed-2a98-4c8a-a588-6c835370513a') or exists(select 1 from public.coach_conversations where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a') or exists(select 1 from public.billing_customers where user_id='0d6e5bed-2a98-4c8a-a588-6c835370513a') then raise exception 'Personal records failed to cascade';end if;
 if not exists(select 1 from public.account_deletion_jobs where user_id is null) then raise exception 'Deletion receipt retained identity';end if;
end $$;
rollback;
\echo Mainline billing database assertions passed (transaction rolled back).
