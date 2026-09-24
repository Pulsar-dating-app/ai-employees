"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  ChevronRightIcon,
  CodeIcon,
  InstagramIcon,
  LinkIcon,
  LockIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { SideDrawer } from "@/components/ui/side-drawer";
import { FilterChips } from "@/components/ui/filter-chips";
import { ChannelsSection } from "./channels-section";
import { InstagramConnectCard } from "./instagram-connect-card";
import { WidgetCustomizeCard } from "./widget-customize-card";
import { EmbedSnippetSection } from "./embed-snippet-section";
import { EmbedDomainsSection } from "./embed-domains-section";
import { DirectLinkSection } from "./direct-link-section";
import { TelegramLinkSection } from "./telegram-link-section";
import { ChannelStatusContext, type ChannelKey, type ChannelStatus } from "./channel-status";

const CHANNELS: ChannelKey[] = ["whatsapp", "instagram", "telegram", "embed", "link"];

const ACCENT: Record<ChannelKey, string> = {
  whatsapp: "#1FA855",
  instagram: "#C13584",
  telegram: "#1D8FC7",
  embed: "#3525cd",
  link: "#3525cd",
};

const TILE: Record<ChannelKey, { className: string; icon: React.ReactNode }> = {
  whatsapp: { className: "bg-[#25D366] text-white", icon: <WhatsAppIcon className="h-5 w-5" /> },
  instagram: {
    className: "bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white",
    icon: <InstagramIcon className="h-5 w-5" />,
  },
  telegram: { className: "bg-[#229ED9] text-white", icon: <TelegramIcon className="h-5 w-5" /> },
  embed: { className: "bg-primary-fixed text-primary", icon: <CodeIcon className="h-5 w-5" /> },
  link: { className: "bg-primary-fixed text-primary", icon: <LinkIcon className="h-5 w-5" /> },
};

type Statuses = Record<ChannelKey, ChannelStatus | null>;

function StatusLine({ status }: { status: ChannelStatus | null }) {
  if (!status) return <span className="block h-4 w-24 animate-pulse rounded-full bg-surface-container-high" />;
  return (
    <span
      className={clsx(
        "flex min-w-0 items-center gap-1.5 text-[13px]",
        status.tone === "ok" && "font-medium text-on-surface",
        status.tone === "warn" && "font-medium text-[#8a5a00]",
        (status.tone === "off" || status.tone === "locked") && "text-on-surface-variant",
      )}
    >
      {status.tone === "locked" ? (
        <LockIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-outline" />
      ) : (
        <span
          aria-hidden="true"
          className={clsx(
            "h-2 w-2 shrink-0 rounded-full",
            status.tone === "ok" && "bg-success-500",
            status.tone === "warn" && "bg-[#f0b429]",
            status.tone === "off" && "border border-outline bg-transparent",
          )}
        />
      )}
      <span className="truncate">{status.label}</span>
    </span>
  );
}

export function ChannelHub({
  companyId,
  agentSlug,
  agentName,
  agentPhotoSrc,
  canEdit,
  whatsappEntitled,
  metaAppId,
  metaConfigId,
  chatUrl,
  embedSnippet,
  telegramLink,
  widgetInitial,
  allowedEmbedDomains,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  agentPhotoSrc: string | null;
  canEdit: boolean;
  whatsappEntitled: boolean;
  metaAppId: string;
  metaConfigId: string;
  chatUrl: string;
  embedSnippet: string;
  telegramLink: string;
  widgetInitial: {
    greeting: string | null;
    launcherType: "default" | "video" | "image";
    launcherAssetUrl: string | null;
    position: "bottom-right" | "bottom-left";
    offsetBottom: number;
  };
  allowedEmbedDomains: string[];
}) {
  const t = useTranslations("MyAgents.channelHub");
  const tTabs = useTranslations("MyAgents.channelTabs");
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ChannelKey>("whatsapp");
  const autoOpened = useRef(false);
  const [statuses, setStatuses] = useState<Statuses>(() => ({
    whatsapp: whatsappEntitled ? null : { tone: "locked", label: t("status.notInPlan") },
    instagram: null,
    telegram: { tone: "ok", label: t("status.ready") },
    embed: null,
    link: { tone: "ok", label: t("status.ready") },
  }));

  const router = useRouter();
  const tones = useRef<Partial<Record<ChannelKey, ChannelStatus["tone"]>>>({});
  const report = useCallback(
    (key: ChannelKey, status: ChannelStatus) => {
      const previousTone = tones.current[key];
      tones.current[key] = status.tone;
      setStatuses((prev) =>
        prev[key]?.tone === status.tone && prev[key]?.label === status.label ? prev : { ...prev, [key]: status },
      );
      if (previousTone && previousTone !== status.tone && (previousTone === "ok" || status.tone === "ok")) {
        router.refresh();
      }
    },
    [router],
  );

  useEffect(() => {
    if (autoOpened.current) return;
    if (!searchParams.get("instagram") && !searchParams.get("instagram_error")) return;
    autoOpened.current = true;
    const frame = requestAnimationFrame(() => {
      setActive("instagram");
      setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [searchParams]);

  function openChannel(key: ChannelKey) {
    setActive(key);
    setOpen(true);
  }

  return (
    <ChannelStatusContext.Provider value={report}>
      <section aria-labelledby="channel-hub-title" className="flex flex-col gap-4">
        <div>
          <h2 id="channel-hub-title" className="text-lg font-semibold tracking-tight text-on-surface">
            {t("title", { name: agentName })}
          </h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">{t("description", { name: agentName })}</p>
        </div>
        <ul data-tour="channels" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CHANNELS.map((key, i) => (
            <li key={key} className="billing-card-in" style={{ "--i": i } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => openChannel(key)}
                aria-haspopup="dialog"
                className="group flex h-full w-full items-center gap-4 rounded-3xl border border-outline-variant/60 bg-surface-container-lowest p-4 text-left shadow-[0_1px_2px_rgba(25,28,29,0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_40px_-24px_rgba(53,37,205,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className={clsx(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm",
                    TILE[key].className,
                  )}
                >
                  {TILE[key].icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[15px] font-semibold text-on-surface">{tTabs(key)}</span>
                  <StatusLine status={statuses[key]} />
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-outline transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <SideDrawer
        open={open}
        keepMounted
        size="lg"
        title={t("drawerTitle", { name: agentName })}
        closeLabel={t("close")}
        onClose={() => setOpen(false)}
      >
        <div className="flex flex-col gap-6">
          <FilterChips
            keys={CHANNELS}
            value={active}
            onChange={(key) => setActive(key as ChannelKey)}
            labelFor={(key) => tTabs(key)}
            label={tTabs("tablistLabel")}
            refreshKey={open}
          />
          <div hidden={active !== "whatsapp"}>
            <ChannelsSection
              companyId={companyId}
              agentSlug={agentSlug}
              agentName={agentName}
              agentPhotoSrc={agentPhotoSrc}
              accent={ACCENT.whatsapp}
              canEdit={canEdit}
              whatsappEntitled={whatsappEntitled}
              metaAppId={metaAppId}
              metaConfigId={metaConfigId}
            />
          </div>
          <div hidden={active !== "instagram"}>
            <InstagramConnectCard
              companyId={companyId}
              agentSlug={agentSlug}
              agentName={agentName}
              agentPhotoSrc={agentPhotoSrc}
              accent={ACCENT.instagram}
              canEdit={canEdit}
            />
          </div>
          <div hidden={active !== "telegram"}>
            <TelegramLinkSection
              agentName={agentName}
              agentPhotoSrc={agentPhotoSrc}
              accent={ACCENT.telegram}
              telegramLink={telegramLink}
            />
          </div>
          <div hidden={active !== "embed"} className="flex flex-col gap-8">
            <WidgetCustomizeCard
              companyId={companyId}
              agentSlug={agentSlug}
              agentName={agentName}
              canEdit={canEdit}
              initial={widgetInitial}
            />
            <div className="h-px w-full bg-outline-variant/60" />
            <EmbedSnippetSection agentName={agentName} embedSnippet={embedSnippet} />
            <div className="h-px w-full bg-outline-variant/60" />
            <EmbedDomainsSection
              companyId={companyId}
              agentName={agentName}
              canEdit={canEdit}
              initialDomains={allowedEmbedDomains}
            />
          </div>
          <div hidden={active !== "link"}>
            <DirectLinkSection
              agentName={agentName}
              agentPhotoSrc={agentPhotoSrc}
              accent={ACCENT.link}
              chatUrl={chatUrl}
            />
          </div>
        </div>
      </SideDrawer>
    </ChannelStatusContext.Provider>
  );
}
