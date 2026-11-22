import { previewAPI } from "@/lib/clarity/console-api";
import { studentCoachPrompt } from "@/lib/student/coach";
import { studentSafetyReply } from "@/lib/student/safety";
export const POST = (request: Request) => previewAPI(request, "student", studentCoachPrompt, studentSafetyReply);
