import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Script from "next/script";
import { createClient } from "@/lib/supabase/server";
import { LandingPageV2 } from "@/components/landing/landing-page-2";
import { AuthModalController } from "@/components/auth/auth-modal-controller";
import { LandingJsonLd } from "@/components/seo/landing-json-ld";

// `?auth=signup` / `?auth=login` render the same landing with an overlay —
// self-referential canonical so Google folds those query variants into the
// bare `/` rather than treating them as duplicate pages.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Signed-in visitors go straight to the app; everyone else sees the real
// public landing page instead of being bounced to /login. Login / sign-up
// are overlays on this page, driven by the `?auth=` query param.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Exception: completing a password reset means exchanging the emailed
  // code for a real, valid session first (src/app/auth/callback/route.ts) --
  // that's the whole mechanism, not a side effect. Bouncing straight to
  // /dashboard the moment that session exists, before the user ever sees
  // the "set a new password" form, would skip the entire point of the flow.
  // Every other `?auth=` mode keeps the usual behavior: an already-signed-in
  // visitor has no reason to see login/signup/forgot-password.
  const { auth } = await searchParams;
  if (user && auth !== "reset-password") redirect("/dashboard");

  return (
    <>
      <LandingJsonLd />
      <LandingPageV2 />
      <Suspense fallback={null}>
        <AuthModalController />
      </Suspense>
      {/* Staffra's own chat widget, dogfooded on the landing. `lazyOnload`
          keeps this third-party script off the critical path so it never
          costs LCP/TBT on the most SEO-important page. */}
<script src="https://www.staffra.io/widget.js" defer data-company="staffra-2" data-agent="malu" data-greeting="Oi! 👋 Posso ajudar a encontrar o que você procura?" data-launcher-src="https://www.staffra.io/widget-launcher.webm" data-offset-bottom="40"></script>
    </>
  );
}
