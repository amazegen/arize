import { configAPI } from "@/lib/clarity/console-api";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => configAPI(request, "adult");
export const POST = (request: Request) => configAPI(request, "adult");
