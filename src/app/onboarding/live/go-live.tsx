"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon, InstagramIcon, LinkIcon, WhatsAppIcon } from "@/components/ui/icons";
import { ShareChatLink } from "@/components/channels/share-chat-link";
import { StepActions } from "../step-card";

export function GoLive({
  agentSlug,
  agentName,
  companyName,
  chatUrl,
  whatsappIncluded,
}: {
  agentSlug: string;
  agentName: string;
  companyName: string;
  chatUrl: string;
  whatsappIncluded: boolean;
}) {
  const t = useTranslations("Onboarding.live");
  // A plain form post is a full page load: the button says it's on its way.
  const [leaving, setLeaving] = useState(false);
  const channelPath = (channel: "instagram" | "whatsapp") => `/dashboard/my-agents/${agentSlug}?canal=${channel}`;

  return (
    <div className="flex flex-col gap-7">
      <section
        aria-labelledby="go-live-link"
        className="flex flex-col gap-4 rounded-lg border-2 border-primary bg-primary-fixed/35 p-4 sm:p-5"
      >
        <span className="w-fit rounded-full bg-primary px-3 py-1 text-label-sm font-semibold text-on-primary">
          {t("link.badge")}
        </span>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary">
            <LinkIcon className="h-5 w-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="go-live-link" className="text-body-lg font-semibold text-on-surface">
              {t("link.title", { name: agentName })}
            </h2>
            <p className="text-sm text-on-surface-variant">{t("link.body", { name: agentName })}</p>
          </div>
        </div>

        <ShareChatLink chatUrl={chatUrl} companyName={companyName} scheduling={agentSlug === "ana"} surface="onboarding" />
      </section>

      <section aria-labelledby="go-live-channels" className="flex flex-col gap-3">
        <div>
          <h2 id="go-live-channels" className="text-body-lg font-semibold text-on-surface">
            {t("channels.title", { name: agentName })}
          </h2>
          <p className="text-sm text-on-surface-variant">{t("channels.subtitle")}</p>
        </div>
        <ChannelRow
          next={channelPath("instagram")}
          tile="bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white"
          icon={<InstagramIcon className="h-5 w-5" />}
          title={t("channels.instagram.title")}
          body={t("channels.instagram.body", { name: agentName })}
          cta={t("channels.connect")}
        />
        <ChannelRow
          next={channelPath("whatsapp")}
          tile="bg-[#25D366] text-white"
          icon={<WhatsAppIcon className="h-5 w-5" />}
          title={t("channels.whatsapp.title")}
          body={t(whatsappIncluded ? "channels.whatsapp.bodyIncluded" : "channels.whatsapp.bodyOwn", {
            name: agentName,
          })}
          cta={t("channels.connect")}
        />
      </section>

      {/* Not filled: sharing the link is this step's one real action, and the
          way out shouldn't outshout it from the sticky phone bar. */}
      <StepActions>
        <form
          method="post"
          action={FINISH_URL}
          onSubmit={() => setLeaving(true)}
          className="w-full sm:w-auto"
        >
          <Button type="submit" variant="secondary" isLoading={leaving} className="w-full sm:w-auto">
            {t("finish")}
          </Button>
        </form>
      </StepActions>
    </div>
  );
}

// Plain HTML form posts, not a server action: see complete-onboarding.ts.
const FINISH_URL = "/api/onboarding/finish";

// Each one ends the first session and lands on that channel's own setup, the
// same panel the dashboard uses -- rebuilding Meta's connect flows inside
// onboarding would be a second copy of the hardest code in the app.
function ChannelRow({
  next,
  tile,
  icon,
  title,
  body,
  cta,
}: {
  next: string;
  tile: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <form method="post" action={FINISH_URL}>
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        className="group flex w-full items-center gap-4 rounded-lg border border-primary-fixed bg-white/80 p-4 text-left transition-colors hover:border-primary/40 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile}`}>{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-on-surface">{title}</span>
          <span className="text-[13px] leading-5 text-on-surface-variant">{body}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-label-md font-semibold text-primary">
          <span className="hidden sm:inline">{cta}</span>
          <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    </form>
  );
}
