"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { SideDrawer } from "@/components/ui/side-drawer";
import { AvailabilityControl } from "./availability-card";
import { IdentityEditor } from "./identity-editor";

type PhotoType = "default_1" | "default_2" | "custom";

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function AgentHero({
  companyId,
  agentSlug,
  name,
  defaultName,
  role,
  blurb,
  photoSrc,
  photoIsCustom,
  active,
  canEdit,
  defaultPhotos,
  initialPhoto,
}: {
  companyId: string;
  agentSlug: string;
  name: string;
  defaultName: string;
  role: string | null;
  blurb: string;
  photoSrc: string | null;
  photoIsCustom: boolean;
  active: boolean;
  canEdit: boolean;
  defaultPhotos: readonly [string, string] | null;
  initialPhoto: { photoType: PhotoType; photoAssetUrl: string | null };
}) {
  const t = useTranslations("MyAgents");
  const [editing, setEditing] = useState(false);

  return (
    <section
      data-tour="agent-name"
      aria-labelledby="agent-hero-name"
      className="relative overflow-hidden rounded-[28px] border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-[0_1px_2px_rgba(25,28,29,0.04),0_24px_60px_-32px_rgba(53,37,205,0.3)] sm:p-8"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
        <div className="billing-card-in relative h-28 w-28 shrink-0 overflow-hidden rounded-[26px] bg-surface-container ring-1 ring-outline-variant/50 sm:h-36 sm:w-36">
          {photoSrc ? (
            photoIsCustom ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoSrc} alt="" className="h-full w-full object-cover object-[center_35%]" />
            ) : (
              <Image src={photoSrc} alt="" fill sizes="144px" priority className="object-cover object-[center_35%]" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <AgentAvatar role="intent" size="lg" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                id="agent-hero-name"
                className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-on-surface"
              >
                {name}
              </h1>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-haspopup="dialog"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary-fixed/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                  {t("hero.editProfile")}
                </button>
              ) : null}
            </div>
            {role ? <p className="text-sm font-medium text-on-surface-variant">{role}</p> : null}
          </div>
          <AvailabilityControl
            companyId={companyId}
            agentSlug={agentSlug}
            agentName={name}
            initialActive={active}
            canEdit={canEdit}
          />
          {blurb ? <p className="max-w-[68ch] text-sm leading-6 text-on-surface-variant">{blurb}</p> : null}
        </div>
      </div>

      <SideDrawer
        open={editing}
        title={t("hero.editTitle", { name })}
        closeLabel={t("hero.close")}
        onClose={() => setEditing(false)}
      >
        <IdentityEditor
          companyId={companyId}
          agentSlug={agentSlug}
          role={role}
          canEdit={canEdit}
          initialName={name}
          defaultName={defaultName}
          defaultPhotos={defaultPhotos}
          initialPhoto={initialPhoto}
          onSaved={() => setEditing(false)}
        />
      </SideDrawer>
    </section>
  );
}
