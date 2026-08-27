import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { BadgeCheckIcon } from "@/components/ui/icons";

// Stitch "Company Settings" right-column card — the hired team member whose
// work these settings shape. Real data (first hired agent); no "sync
// status" row (removed per product decision).
export async function PersonaAside({
  name,
  role,
  photoSrc,
}: {
  name: string;
  role: string | null;
  photoSrc: string | null;
}) {
  const t = await getTranslations("Settings");

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 lg:sticky lg:top-24">
      <div className="relative h-24 bg-primary-container">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
            backgroundSize: "10px 10px",
          }}
        />
      </div>
      <div className="relative px-6 pb-6">
        <div className="absolute -top-9 h-[72px] w-[72px] overflow-hidden rounded-full border-4 border-surface-container-lowest bg-surface-container">
          {photoSrc ? (
            <Image src={photoSrc} alt={name} fill sizes="72px" className="object-cover object-top" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <AgentAvatar role="intent" />
            </div>
          )}
        </div>
        <div className="mt-11 flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-base font-semibold text-on-surface">{name}</h4>
              <BadgeCheckIcon className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xs font-medium text-on-surface-variant">{role}</p>
          </div>
          <p className="border-l-2 border-primary bg-surface-container-low px-3 py-2 text-[13px] italic leading-relaxed text-on-surface-variant">
            {t("personaQuote")}
          </p>
        </div>
      </div>
    </div>
  );
}
