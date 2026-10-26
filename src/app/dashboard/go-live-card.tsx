"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/icons";
import { ShareChatLink } from "@/components/channels/share-chat-link";
import { useSetupSteps } from "./setup-steps-context";

// Leads the home page until the first channel is live (the checklist's own
// "channel" fact: a connected account, an allowed site, or a first real
// conversation). Every ad sign-up before 2026-10-26 finished setting her up
// and then never put her anywhere; this is the thing to do next, with the
// link ready to send rather than a pointer to the page that has it.
export function GoLiveCard({
  agentSlug,
  agentName,
  photoSrc,
  companyName,
  chatUrl,
}: {
  agentSlug: string;
  agentName: string;
  photoSrc: string | null;
  companyName: string;
  chatUrl: string;
}) {
  const t = useTranslations("Dashboard.goLive");
  const channel = useSetupSteps().find((s) => s.key === "channel");
  if (!channel || channel.done) return null;

  const channelHref = (key: "instagram" | "whatsapp") => `/dashboard/my-agents/${agentSlug}?canal=${key}`;

  return (
    <section
      aria-labelledby="go-live-title"
      className="flex flex-col gap-5 rounded-3xl border-2 border-primary/40 bg-surface-container-lowest p-5 shadow-[0_18px_40px_-24px_rgba(53,37,205,0.45)] sm:p-7"
    >
      <div className="flex items-start gap-4">
        {photoSrc ? (
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-primary-fixed ring-1 ring-primary-fixed">
            <Image src={photoSrc} alt="" fill sizes="48px" className="object-cover object-top" />
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="go-live-title" className="text-headline-md font-semibold tracking-tight text-on-surface">
            {t("title", { name: agentName })}
          </h2>
          <p className="text-body-md text-on-surface-variant">{t("body", { name: agentName })}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-primary-fixed/35 p-4 sm:p-5">
        <ShareChatLink chatUrl={chatUrl} companyName={companyName} scheduling={agentSlug === "ana"} surface="home" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-on-surface-variant">{t("orChannels", { name: agentName })}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChannelLink
            href={channelHref("instagram")}
            tile="bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white"
            icon={<InstagramIcon className="h-4 w-4" />}
            label={t("instagram")}
          />
          <ChannelLink
            href={channelHref("whatsapp")}
            tile="bg-[#25D366] text-white"
            icon={<WhatsAppIcon className="h-4 w-4" />}
            label={t("whatsapp")}
          />
        </div>
      </div>
    </section>
  );
}

function ChannelLink({ href, tile, icon, label }: { href: string; tile: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-12 items-center gap-3 rounded-xl border border-outline-variant/60 px-3.5 py-2.5 transition-colors hover:border-primary/30 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tile}`}>{icon}</span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-on-surface">{label}</span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-outline transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
