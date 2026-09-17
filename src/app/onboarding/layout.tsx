import Image from "next/image";
import { getLocale } from "next-intl/server";
import { StepRail } from "./step-rail";
import { LocaleToggle } from "./onboarding-form";
import logoIcon from "../../../public/logo-icon.png";
import type { Locale } from "@/i18n/request";

// The first session runs outside the dashboard shell: no sidebar, no top bar,
// nothing to navigate away into. One centred column on the Stitch onboarding
// ground (indigo → white diagonal), which is this route's incumbent identity
// -- kept, but given actual depth: two slow-drifting indigo pools and a
// grain layer stop the gradient from reading as a flat CSS fill, without
// introducing a color the surface doesn't already own.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[linear-gradient(135deg,#e0e7ff_0%,#f8f9fa_60%,#ffffff_100%)] px-4 py-10 sm:py-14">
      <div
        aria-hidden
        className="onboarding-ground-pool-a pointer-events-none absolute -left-1/4 -top-1/4 h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgba(53,37,205,0.16),transparent)] blur-3xl"
      />
      <div
        aria-hidden
        className="onboarding-ground-pool-b pointer-events-none absolute -bottom-1/3 -right-1/4 h-[65vmax] w-[65vmax] rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.14),transparent)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 flex w-full max-w-[640px] flex-1 flex-col">
        <div className="mb-10 flex justify-center">
          <Image src={logoIcon} alt="Staffra" priority className="h-12 w-12 object-contain" />
        </div>

        <StepRail />

        {children}

        <div className="mt-12 flex justify-center">
          <LocaleToggle currentLocale={locale as Locale} />
        </div>
      </div>
    </main>
  );
}
