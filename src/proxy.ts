import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from "@/i18n/locales";
import { LOCALE_REQUEST_HEADER, routePublicRequest, shouldPinLocaleCookie } from "@/i18n/routing";

export async function proxy(request: NextRequest) {
  // Safety net for a Supabase auth email whose `redirectTo` doesn't
  // exactly match the Redirect URLs allow-list (query string included) --
  // Supabase falls back to the Site URL but still attaches a valid `?code=`,
  // which would otherwise just sit inert on the bare landing page. Forward
  // it to the real handler instead of losing an already-valid code.
  // See src/app/auth/callback/route.ts's doc comment for the full story.
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/" && searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  // Per-locale URLs for the public pages (src/i18n/routing.ts): redirect to
  // the visitor's language, or pin the page's locale for resolveLocale().
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const acceptLanguage = request.headers.get("accept-language");
  const route = routePublicRequest({ pathname, search: request.nextUrl.search, cookieLocale, acceptLanguage });

  if (route?.kind === "redirect") {
    const url = new URL(route.location, request.url);
    const response = NextResponse.redirect(url, route.permanent ? 308 : 307);
    // The language redirect on unprefixed pages depends on these two.
    if (!route.permanent) response.headers.set("Vary", "Cookie, Accept-Language");
    return response;
  }

  // The locale header is always stripped first so a client can't spoof it
  // onto a page that isn't localized.
  const response = await updateSession(request, (headers) => {
    headers.delete(LOCALE_REQUEST_HEADER);
    if (route?.kind === "serve") headers.set(LOCALE_REQUEST_HEADER, route.locale);
  });

  if (route?.kind === "serve" && shouldPinLocaleCookie({ served: route.locale, cookieLocale, acceptLanguage })) {
    response.cookies.set(LOCALE_COOKIE, route.locale, LOCALE_COOKIE_OPTIONS);
  }
  return response;
}

export const config = {
  matcher: [
    // `c/` (Trello E1's checkout redirect), `api/chat/` (Trello M3's public
    // chat API), `api/sales-contact` (the landing page's "Talk to a
    // specialist" form), `talk/` (Trello M4's standalone hosted chat page),
    // `api/webhooks/` (Trello N4's Instagram inbound webhook) and
    // `api/cron/` (Trello N6's token-refresh job) are excluded
    // deliberately: all are public, unauthenticated surfaces called
    // directly by a customer, by Meta, or by a scheduler with no Staffra
    // session, so running updateSession's supabase.auth.getUser()
    // round-trip on them would add latency for nothing -- there is no
    // cookie to refresh in the first place. `api/cron/` is guarded by a
    // bearer CRON_SECRET inside the route, not by a session.
    "/((?!_next/static|_next/image|favicon.ico|og/|c/|api/chat/|api/sales-contact|talk/|api/webhooks/|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
