import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validSetupToken } from "@/lib/student/account-setup";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Open this link in Arize to continue." }, { status: 403, headers });
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) throw new Error("Invalid request");
    const body = await request.json();
    if (!validSetupToken(body.token_hash, body.type)) throw new Error("Invalid request");
    const client = await createClient();
    const { error } = await client.auth.verifyOtp({ token_hash: body.token_hash, type: body.type });
    if (error) return NextResponse.json({ error: "This link has expired or has already been used. Request a new password setup email below." }, { status: 400, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "This setup link is not valid. Request a new password setup email below." }, { status: 400, headers });
  }
}
