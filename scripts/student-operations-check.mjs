// Opt-in, server-side release check. No real user email or AI request is sent.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { BELONGING_NOTICE } from "../lib/student/belonging.ts";
let stage="disabled";
async function run(){
 if(process.env.ARIZE_STUDENT_OPERATIONS_CHECK!=="synthetic-only")return;
 assert.equal(process.env.VERCEL_PROJECT_ID,"prj_xFxdpxs5BR6RRcFLdZiok6h0Lqvi");
 assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,"https://kqwlqdsyocawljofrsvt.supabase.co");assert.equal(process.env.ARIZE_EDITION,"student");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const accounts=[];const schoolId=randomUUID();const schoolName=`SYNTHETIC OPERATIONS CHECK ${randomUUID()}`;let schoolCreated=false;let server;let cleanupFailed=false;
 const base="http://127.0.0.1:3199";const pass=message=>console.log(`[student-operations-check] PASS ${message}`);
 async function db(request){const r=await request;if(r.error)throw Object.assign(new Error("Database check failed"),{code:r.error.code,status:r.status});return r.data;}
 async function account(){
  const password=randomBytes(32).toString("base64url");const email=`arize-operations-${randomUUID()}@example.org`;
  const r=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{arize_operations_check:true}});if(r.error||!r.data.user)throw new Error("Account setup failed");
  const a={id:r.data.user.id,cookies:new Map(),token:null};accounts.push(a);
  a.client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...a.cookies].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(({name,value})=>a.cookies.set(name,value))}});
  const signed=await a.client.auth.signInWithPassword({email,password});if(signed.error||!signed.data.session)throw new Error("Sign-in failed");a.token=signed.data.session.access_token;return a;
 }
 async function call(a,path,body,expected=200){
  const r=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{...(a?{Cookie:[...a.cookies].map(([n,v])=>`${n}=${v}`).join("; ")} : {}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"manual",signal:AbortSignal.timeout(20000)});
  if(r.status!==expected)throw Object.assign(new Error("Unexpected status"),{status:r.status});
  return r.headers.get("content-type")?.includes("application/json")?r.json():null;
 }
 const op=(a,body,status)=>call(a,"/api/student/operations",body,status);
 try{
  stage="setup";await db(admin.from("student_schools").insert({id:schoolId,name:schoolName}));schoolCreated=true;
  const operator=await account();const teacher=await account();const student=await account();
  await db(admin.from("student_operators").insert({user_id:operator.id,active:true}));
  await db(admin.from("student_pilot_memberships").insert({user_id:student.id,school_id:schoolId,status:"active",role:"student",consent_verified_at:new Date().toISOString()}));
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3199"],{env:{...process.env,STUDENT_AI_ENABLED:"false",STUDENT_COUNSELOR_NOTIFICATIONS_ENABLED:"false"},stdio:"ignore"});
  let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+"/student/sign-in",{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;if(server.exitCode!==null)throw new Error("Test server exited");await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
  stage="pending-access";await call(null,"/api/student/operations",undefined,401);
  await op(teacher,{action:"apply",name:"Synthetic teacher",school:schoolName,role:"teacher",acknowledged:true});
  assert.equal((await op(teacher)).state.role,null);
  await op(teacher,{action:"class",label:"Forged class"},403);
  await op(teacher,{action:"review",userId:teacher.id,schoolId,approve:true,verified:true},403);
  pass("staff applications persist without self-granting a role or exposing operator data");
  stage="teacher-approval";await op(operator,{action:"review",userId:teacher.id,schoolId,approve:true,verified:true});
  assert.equal((await op(teacher)).state.role,"teacher");await op(teacher,{action:"class",label:"Synthetic advisory"});
  const classroom=(await op(teacher)).state.classes[0];assert.ok(classroom.id);
  const attendance={action:"attendance",classId:classroom.id,day:new Date().toISOString().slice(0,10),enrolled:25,present:23,absent:2,lesson:"fresh-start"};
  await op(teacher,attendance,403);
  await op(operator,{action:"authorize",schoolId,reference:"Synthetic authorized operations check",confirmed:true,attendance:true,topics:true,belonging:true,ambassadors:true,reporting:true});
  await op(teacher,attendance);await op(teacher,{...attendance,present:24,absent:1});
  const records=(await op(teacher)).state.records;assert.equal(records.length,1);assert.equal(records[0].present,24);
  await op(teacher,{...attendance,present:24,absent:2},400);await call(teacher,"/api/student/admin/dashboard",undefined,403);
  const privateRows=await db(teacher.client.from("student_messages").select("id"));assert.equal(privateRows.length,0);
  pass("verified teacher attendance persists, edits do not double-count, invalid totals and private activity are denied");
  stage="school-reporting";await op(operator,{action:"apply",name:"Synthetic school administrator",school:schoolName,role:"school_staff",acknowledged:true});
  await op(operator,{action:"review",userId:operator.id,schoolId,approve:true,verified:true});
  const month=new Date().toISOString().slice(0,7)+"-01";
  await op(operator,{action:"ambassadors",month,interested:20,oriented:12,active:10});
  const lastMonth=new Date();lastMonth.setUTCDate(1);lastMonth.setUTCMonth(lastMonth.getUTCMonth()-1);
  await op(operator,{action:"publish",month:lastMonth.toISOString().slice(0,10),schoolId});
  const dashboard=await call(operator,"/api/student/admin/dashboard");assert.equal(dashboard.reports[0].report.version,2);assert.deepEqual(dashboard.requests,[]);
  await op(teacher,{action:"ambassadors",month,interested:20,oriented:12,active:10},403);
  pass("school program totals save and completed-month reports load from the backend without sample fallback");
  stage="optional-student-data";await call(student,"/api/student",{action:"profile",displayName:"Synthetic operations student",username:"",grade:"10",acknowledged:true});
  await call(student,"/api/student/topics",{topics:["tests"],acknowledged:false,notice:"topics-pilot-2026-10-29-v1"},400);
  await call(student,"/api/student/topics",{topics:["tests","sleep"],acknowledged:true,notice:"topics-pilot-2026-10-29-v1"});
  assert.equal((await call(student,"/api/student/topics")).topics.length,2);
  await call(student,"/api/student/topics",{topics:[],acknowledged:false,notice:""});assert.equal((await call(student,"/api/student/topics")).topics.length,0);
  await call(student,"/api/student/belonging",{welcome:4,trusted_adult:null,connection:3,language:"en",noticeVersion:BELONGING_NOTICE,acknowledged:true});
  assert.equal((await call(student,"/api/student/belonging")).history.length,1);
  await op(student,{action:"apply",name:"Student spoof",school:schoolName,role:"teacher",acknowledged:true},403);
  await call(teacher,"/api/student/belonging",undefined,403);
  pass("updated opt-in notices, topic persistence/withdrawal and private belonging persistence work; students cannot become staff");
  stage="revocation";await op(operator,{action:"revoke",userId:teacher.id,confirmed:true});
  await op(teacher,{action:"class",label:"Revoked write"},403);assert.equal((await db(teacher.client.from("student_classrooms").select("id"))).length,0);
  pass("revocation blocks the teacher's already-issued session");
 }finally{
  server?.kill("SIGTERM");
  for(const a of accounts){try{
   await db(admin.from("student_staff_memberships").update({active:false}).eq("user_id",a.id));
   await db(admin.from("student_pilot_memberships").update({status:"revoked"}).eq("user_id",a.id));
   if(a.token){const r=await admin.auth.admin.signOut(a.token,"global");if(r.error)throw new Error("Session cleanup");}
   const r=await admin.auth.admin.deleteUser(a.id);if(r.error)throw new Error("Account cleanup");
  }catch{cleanupFailed=true;console.error(`[student-operations-check] synthetic cleanup requires review: ${a.id}`);}}
  if(schoolCreated){try{await db(admin.from("student_schools").delete().eq("id",schoolId).eq("name",schoolName));}catch{cleanupFailed=true;}}
  if(cleanupFailed)throw new Error("Synthetic cleanup incomplete");
 }
 console.log("[student-operations-check] PASS all test accounts, class records and schools removed; no real email or AI calls sent");
}
run().catch(error=>{console.error(`[student-operations-check] FAIL stage=${stage} status=${typeof error?.status==="number"?error.status:"unknown"} code=${/^[A-Z0-9_]{1,30}$/.test(error?.code??"")?error.code:"unknown"}`);process.exitCode=1;});
