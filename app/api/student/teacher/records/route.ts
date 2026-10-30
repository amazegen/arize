import { getOperationsSession } from "@/lib/student/operations-server";
import { studentNoStore } from "@/lib/student/server";
import { validDay } from "@/lib/student/policy";
import { validId } from "@/lib/student/features";
export async function GET(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:studentNoStore});
 const session=await getOperationsSession();if(!session.ok)return reply({error:session.error},session.status);
 if(session.state.role!=="teacher")return reply({error:"Teacher access required."},403);
 const p=new URL(request.url).searchParams;const before=p.get("before");const day=p.get("day");const classroom=p.get("class");const cursor=before?.split("|");
 if(cursor&&(cursor.length!==2||!validDay(cursor[0])||!validId(cursor[1]))||day&&!validDay(day)||classroom&&!validId(classroom))return reply({error:"Choose a valid date and class."},400);
 const result=await session.supabase.rpc("student_teacher_records",{p_before:cursor?.[0]??null,p_before_class:cursor?.[1]??null,p_day:day,p_class:classroom});
 if(result.error)return reply({error:"Your class records could not be loaded."},503);
 const rows=result.data as {classroom_id:string;day:string}[];const items=rows.slice(0,50);const last=items.at(-1);
 return reply({items,next:rows.length>50&&last?`${last.day}|${last.classroom_id}`:null});
}
