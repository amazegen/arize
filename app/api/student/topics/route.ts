import { getStudentSession, readStudentBody, studentNoStore } from "@/lib/student/server";
import { STUDENT_TOPICS } from "@/lib/student/learning";
import { shiftDay } from "@/lib/student/features";
export const dynamic = "force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:studentNoStore});
export async function GET() {
 const session=await getStudentSession();if(!session.ok)return reply({error:session.error},session.status);
 const approval=await session.supabase.rpc("student_feature_enabled",{p_feature:"topics"});
 if(approval.error)return reply({error:"Topic settings could not be loaded."},503);
 const calendar=await session.supabase.rpc("student_calendar_state");if(calendar.error)return reply({error:"School calendar could not be loaded."},503);
 const today=calendar.data.today as string;const weekday=new Date(`${today}T12:00:00Z`).getUTCDay()||7;const week=shiftDay(today,1-weekday);
 const result=await session.supabase.from("student_topic_choices").select("topic").eq("user_id",session.user.id).eq("week_of",week);
 if(result.error)return reply({error:"Topic choices could not be loaded."},503);
 return reply({enabled:approval.data===true,topics:result.data.map(r=>r.topic)});
}
export async function POST(request:Request) {
 const session=await getStudentSession();if(!session.ok)return reply({error:session.error},session.status);
 const b=await readStudentBody(request);
 if(!b||!Array.isArray(b.topics)||b.topics.length>8||!b.topics.every(v=>STUDENT_TOPICS.some(t=>t.id===v))||(b.topics.length>0&&(b.acknowledged!==true||b.notice!=="topics-pilot-2026-10-29-v1")))return reply({error:"Choose valid topics and acknowledge the optional sharing notice."},400);
 const result=await session.supabase.rpc("student_save_topics",{p_topics:b.topics,p_acknowledged:b.acknowledged===true,p_notice:b.notice??""});
 if(result.error)return reply({error:"Topics could not be saved. Check school approval and complete the current student notice."},result.error.code==="42501"?403:400);
 return reply({saved:true});
}
