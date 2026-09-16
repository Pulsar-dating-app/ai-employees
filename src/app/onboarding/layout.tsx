import Image from "next/image";
import { getLocale } from "next-intl/server";
import { StepRail } from "./step-rail";
import { LocaleToggle } from "./onboarding-form";
import logoIcon from "../../../public/logo-icon.png";
import type { Locale } from "@/i18n/request";

// The first session runs outside the dashboard shell: no sidebar, no top bar,
// nothing to navigate away into. One centred column on the Stitch onboarding
// ground (indigo → white diagonal), which is this route's incumbent identity.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-[linear-gradient(135deg,#e0e7ff_0%,#f8f9fa_60%,#ffffff_100%)] px-4 py-10 sm:py-14">
      <div className="flex w-full max-w-[640px] flex-1 flex-col">
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
