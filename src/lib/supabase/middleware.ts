import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/access-removed"];
const AUTH_PAGES = ["/login", "/sign-up"];

// Refreshes the Supabase session cookie on every request and gates access to
// protected routes. Server Components can't write cookies themselves, so this
// is what actually keeps sessions alive across navigations.
//
// `rewriteHeaders` adjusts the request headers forwarded to the page (the
// proxy uses it for the URL-locale header). It's applied to a fresh copy
// each time a response is built, so cookies refreshed in `setAll` below are
// still forwarded alongside it.
export async function updateSession(
  request: NextRequest,
  rewriteHeaders?: (headers: Headers) => void,
) {
  function forwarded() {
    const headers = new Headers(request.headers);
    rewriteHeaders?.(headers);
    return { headers };
  }

  let supabaseResponse = NextResponse.next({ request: forwarded() });

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
          supabaseResponse = NextResponse.next({ request: forwarded() });
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

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
