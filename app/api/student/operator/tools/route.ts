import { getOperationsSession } from "@/lib/student/operations-server";
import { readStudentBody, studentNoStore } from "@/lib/student/server";
import { validPrivacyReview } from "@/lib/student/privacy";
import { validId } from "@/lib/student/features";
import { staffDashboardDTO, type SchoolReport } from "@/lib/student/staff";
const reply = (body: unknown,status=200) => Response.json(body,{status,headers:studentNoStore});
export async function GET(request: Request) {
  const session=await getOperationsSession();if(!session.ok)return reply({error:session.error},session.status);
  if(!session.state.operator)return reply({error:"Project administrator access required."},403);
  const params=new URL(request.url).searchParams;const section=params.get("section");const before=params.get("before");
  if(before && before.length>150)return reply({error:"Invalid page cursor."},400);
  let rpc: string;let args: Record<string,unknown>;
  if(["applications","staff","reports"].includes(section??"")){rpc="student_operator_directory";args={p_section:section,p_before:before};}
  else if(section==="audit"||section==="privacy"){
    const pieces=before?.split("|");if(pieces && (pieces.length!==2||Number.isNaN(Date.parse(pieces[0]))||!validId(pieces[1])))return reply({error:"Invalid page cursor."},400);
    rpc=section==="audit"?"student_operator_audit":"student_privacy_queue";args={p_before:pieces?.[0]??null,p_before_id:pieces?.[1]??null};
    if(section==="audit"){const source=params.get("source");if(source&&!["staff","scope","enrollment","notification","privacy"].includes(source))return reply({error:"Invalid audit filter."},400);args.p_source=source;}
  }else if(section==="calendars"){rpc="student_operator_calendars";args={};}
  else return reply({error:"Choose a valid tool."},400);
  const result=await session.supabase.rpc(rpc,args);if(result.error)return reply({error:"This tool is unavailable. No sample records are substituted."},result.error.code==="42501"?403:503);
  const rows=result.data as Record<string,unknown>[];let items=section==="calendars"?rows:rows.slice(0,50);
  const last=items[items.length-1];const next=rows.length>50&&last?(typeof last.cursor==="string"?last.cursor:`${section==="privacy"?last.created_at:last.at}|${last.id}`):null;
  if(section==="reports")items=items.map(row=>{
    const safe=staffDashboardDTO({role:"school_staff",schoolName:"",requests:[],hasMore:false,reportingApproved:true,reports:[row as unknown as SchoolReport]}).reports[0];
    return {...safe,schoolId:row.schoolId,schoolName:row.schoolName};
  });
  return reply({items,next:section==="calendars"?null:next});
}
export async function POST(request: Request) {
  const session=await getOperationsSession();if(!session.ok)return reply({error:session.error},session.status);
  if(!session.state.operator)return reply({error:"Project administrator access required."},403);
  const body=await readStudentBody(request);if(!body)return reply({error:"Invalid request."},400);
  let rpc:string;let args:Record<string,unknown>;
  if(body.action==="privacy-review"&&validPrivacyReview(body)){rpc="student_review_privacy";args={p_request:body.requestId,p_status:body.status,p_reference:body.reference};}
  else if(body.action==="calendar"&&validId(body.schoolId)&&typeof body.timeZone==="string"&&body.timeZone.length<=100&&body.confirmed===true){rpc="student_school_calendar";args={p_school:body.schoolId,p_zone:body.timeZone};}
  else return reply({error:"Confirm a valid action and review reference."},400);
  const result=await session.supabase.rpc(rpc,args);if(result.error)return reply({error:result.error.code==="55000"?"This school calendar is frozen because enrollment or recorded activity already exists.":"The change could not be saved. Check your role, reference and selected values."},result.error.code==="42501"?403:400);
  return reply({saved:true,message:body.action==="calendar"?"School calendar saved. No student or school was activated.":"Privacy case status saved. This does not delete data or perform the requested action automatically."});
}
