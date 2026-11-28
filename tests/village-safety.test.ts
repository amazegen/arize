import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validSafetyRequest,safetyError} from '../lib/village/safety.ts'
import {villageMediaPath} from '../lib/village/media.ts'
const room='71000000-0000-4000-8000-000000000001',message='72000000-0000-4000-8000-000000000001'
test('Village safety requests accept only bounded UUIDs, actions, reasons and decisions',()=>{
 assert.ok(validSafetyRequest({p_action:'state',p_room:room}))
 assert.ok(validSafetyRequest({p_action:'report',p_room:room,p_message:message,p_reason:'harassment'}))
 assert.ok(validSafetyRequest({p_action:'moderate',p_room:room,p_message:message,p_decision:'hide'}))
 assert.ok(validSafetyRequest({p_action:'unblock',p_target:room}))
 for(const input of [{p_action:'admin'},{p_action:'block',p_room:room},{p_action:'state',p_room:'bad'},
  {p_action:'report',p_room:room,p_message:message,p_reason:'private free text'},
  {p_action:'moderate',p_room:room,p_message:message,p_decision:'delete'},
  {p_action:'state',p_room:room,user_id:room}])assert.equal(validSafetyRequest(input),false)
 assert.doesNotMatch(safetyError({code:'unknown',message:'secret SDK payload'}),/secret/)
})
test('Village media accepts only owned-format keys or exact local-installation legacy public paths',()=>{
 const key=room+'/'+message+'/fixture.webm',origin='https://adult.example.test'
 assert.equal(villageMediaPath(key,origin),key)
 assert.equal(villageMediaPath(origin+'/storage/v1/object/public/village-audio/'+key,origin),key)
 for(const value of ['https://tracker.test/'+key,origin+'/storage/v1/object/public/village-audio/'+key+'?x=1',key+'/../secret',room+'/'+message+'/%2fsecret',origin+'/other/'+key])assert.equal(villageMediaPath(value,origin),null)
})
test('Adult safety wiring enforces database visibility/spam, explicit roles and auditable reversible actions',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261124174225_adult_village_safety.sql',import.meta.url),'utf8')
 assert.match(sql,/edition='adult'/);assert.match(sql,/as restrictive for select/)
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/new\.created_at:=at_time/)
 assert.match(sql,/interval '2 seconds'/);assert.match(sql,/>=10/);assert.match(sql,/>=120/)
 assert.match(sql,/values\(auth\.uid\(\),target_room_id,false\)/)
 assert.match(sql,/revoke all on function public\.assign_village_moderator\(uuid,uuid\) from public,anon,authenticated/)
 assert.match(sql,/insert into village_safety_private\.audit/);assert.match(sql,/update storage\.buckets set public=false/)
 const ui=readFileSync(new URL('../components/village/SafetyTools.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|console\.(log|error)|service_role/)
 const web=readFileSync(new URL('../app/(app)/village/[roomId]/page.tsx',import.meta.url),'utf8')
 assert.match(web,/createSignedUrl\(path,60\)/);assert.doesNotMatch(web,/getPublicUrl\(|assign_village_moderator|console\.error/)
})
