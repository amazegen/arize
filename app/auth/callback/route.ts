import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/consent";
import { isStudentEdition } from "@/lib/student/policy";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeRedirectPath(searchParams.get("next"));

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (isStudentEdition()) return NextResponse.redirect(`${origin}${["/student/staff","/student/admin","/student/teacher","/student/operator"].includes(next) ? next : "/student"}`);
      // Check if user has completed onboarding
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const [{ data: profile }, { data: consent }] = await Promise.all([
          supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("legal_consents")
            .select("id")
            .eq("user_id", user.id)
            .eq("terms_version", TERMS_VERSION)
            .eq("privacy_version", PRIVACY_VERSION)
            .maybeSingle(),
        ]);

        if (!consent) {
          return NextResponse.redirect(`${origin}/consent`);
        }

        if (!profile?.onboarded) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}${isStudentEdition() ? "/student/sign-in" : "/sign-in"}?error=auth-failed`,
  );
}
