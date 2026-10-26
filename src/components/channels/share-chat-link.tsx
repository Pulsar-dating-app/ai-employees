"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  InstagramIcon,
  SendIcon,
  ShareIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { useCopyFeedback } from "@/components/ui/use-copy-feedback";
import { track } from "@/lib/funnel/client";

// The hosted chat link as something to hand out, not just a URL to copy: the
// phone's share sheet, copy, and where it actually gets customers (bio,
// WhatsApp greeting, a DM). Shared by the onboarding live step, the home
// page's "not answering anyone yet" card and the agent's Link panel, which is
// every place a merchant decides to put her to work.
export function ShareChatLink({
  chatUrl,
  companyName,
  scheduling,
  surface,
  showTips = true,
}: {
  chatUrl: string;
  companyName: string;
  // Where it was handed out from, for the funnel events.
  surface: "onboarding" | "home" | "agent";
  // Ana's businesses take bookings; the message they send says so.
  scheduling: boolean;
  showTips?: boolean;
}) {
  const t = useTranslations("ShareLink");
  const { copied, copy } = useCopyFeedback();
  const [shared, setShared] = useState(false);

  // What the merchant sends their customers: about the business, never about
  // who answers.
  const shareText = t(scheduling ? "shareTextBooking" : "shareTextSales", { company: companyName });

  async function share() {
    // The phone's own share sheet first: it reaches WhatsApp, Instagram and
    // everything else installed. Desktop browsers without it get WhatsApp's
    // share page, the channel nearly every merchant here uses.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: shareText, url: chatUrl });
        setShared(true);
        track("link_shared", { surface, via: "share_sheet" });
      } catch {
        // Dismissing the sheet throws; nothing to report.
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${chatUrl}`)}`, "_blank", "noopener");
    setShared(true);
    track("link_shared", { surface, via: "whatsapp_web" });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="truncate rounded-md border border-primary-fixed bg-white px-3 py-2.5 font-mono text-[13px] text-on-surface">
        {chatUrl}
      </p>

      <div className="flex gap-3 whitespace-nowrap">
        <Button type="button" onClick={share} className="flex-1 px-4!">
          <ShareIcon className="h-4 w-4 shrink-0" />
          {t("share")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => {
            copy(chatUrl);
            track("link_copied", { surface });
          }} aria-live="polite" className="px-4!">
          {copied ? <CheckIcon className="h-4 w-4 shrink-0" /> : <CopyIcon className="h-4 w-4 shrink-0" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>

      {showTips ? (
        <div className="flex flex-col gap-2.5 border-t border-primary-fixed pt-4">
          <p className="text-label-md font-semibold text-on-surface">{t("whereTitle")}</p>
          <ul className="flex flex-col gap-2.5">
            {(
              [
                ["instagramBio", <InstagramIcon key="i" className="h-4 w-4" />],
                ["whatsappGreeting", <WhatsAppIcon key="w" className="h-4 w-4" />],
                ["direct", <SendIcon key="s" className="h-4 w-4" />],
              ] as const
            ).map(([key, icon]) => (
              <li key={key} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
                <span>
                  <span className="font-medium text-on-surface">{t(`where.${key}.title`)}</span> {t(`where.${key}.how`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <a
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-label-md font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t("test")}
        <ExternalLinkIcon className="h-3.5 w-3.5" />
      </a>
      {shared ? (
        <p role="status" className="text-sm font-medium text-tertiary">
          {t("sharedNote")}
        </p>
      ) : null}
    </div>
  );
}
