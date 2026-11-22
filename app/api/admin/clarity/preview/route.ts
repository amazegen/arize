import { previewAPI } from "@/lib/clarity/console-api";
import { ADULT_PROMPT } from "@/lib/clarity/adult-prompt";
import { adultSafetyReply } from "@/lib/clarity/safety";
export const POST = (request: Request) => previewAPI(request, "adult", () => ADULT_PROMPT, adultSafetyReply);
