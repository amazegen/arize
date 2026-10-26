import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAllowedStudentDeploymentRoute,
  isStudentEdition,
  isStudentRoute,
} from "./lib/student/policy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/student-design") {
    return process.env.NODE_ENV === "development"
      ? NextResponse.next()
      : new NextResponse(null, { status: 404 });
  }
  if (isStudentEdition()) {
    // A student deployment never serves the adult Village, checkout, or coach.
    if (!isAllowedStudentDeploymentRoute(pathname)) {
      if (pathname.startsWith("/api/"))
        return new NextResponse(null, { status: 404 });
      return NextResponse.redirect(new URL("/student", request.url));
    }
    // Let the page/API return its explicit setup error if credentials are absent.
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
      return NextResponse.next();
  } else if (isStudentRoute(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes — require auth
  const protectedPaths = [
    "/home",
    "/reset",
    "/goals",
    "/village",
    "/coach",
    "/settings",
    "/onboarding",
    "/consent",
  ];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  // Auth routes — redirect to home if already logged in
  const authPaths = ["/sign-in", "/sign-up"];
  const isAuthRoute = authPaths.includes(pathname);

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
