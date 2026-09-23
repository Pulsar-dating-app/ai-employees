"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { WhatsAppIcon, CheckIcon, LockIcon } from "@/components/ui/icons";
import { ChannelPanelHeader } from "./channel-panel-header";
import { ChannelPreview } from "./channel-preview";

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; xfbml: boolean; version: string; fedCM?: boolean }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        params: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type Connection = {
  provider: "meta" | "twilio";
  phone_e164: string | null;
  display_phone_number: string | null;
  status: "pending" | "connected" | "disconnected";
  connected_at: string | null;
  sender_status: string | null;
};

type ViewState = "loading" | "idle" | "connecting" | "registering" | "disconnecting" | "confirmingDisconnect";

// A sender registered through Twilio goes CREATING -> ONLINE while WhatsApp
// reviews the display name (minutes to hours). While it's pending, re-read the
// status route (which refreshes it from Twilio) at this interval so the card
// flips to "Connected" without a page reload.
const PENDING_POLL_MS = 10_000;

// Same shape Meta accepts for the merchant-typed number: `+`, then 8-15
// digits (spaces, dashes and parentheses tolerated). The server re-validates;
// this only catches the obvious slip before opening Meta's popup.
function looksLikeE164(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value.trim().replace(/[\s().-]/g, ""));
}

// The WhatsApp connect screen for the Twilio provider (2026-09-23; see
// decisions.md). The merchant types the number they want to use and the
// business name, then completes Meta's Embedded Signup popup (which creates
// their WhatsApp Business account and verifies the number by code). The popup
// hands back only the account id -- everything after that happens on the
// server, on Twilio's side, and the merchant never sees Meta billing: message
// costs are covered by the plan.
export function WhatsappTwilioSection({
  companyId,
  agentSlug,
  agentName,
  agentPhotoSrc,
  accent,
  canEdit,
  whatsappEntitled,
  metaAppId,
  twilioConfigId,
  partnerSolutionId,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  agentPhotoSrc: string | null;
  accent: string;
  canEdit: boolean;
  // Whether the company's plan includes the WhatsApp add-on -- see
  // channels-section.tsx for why this is only the UI half of the gate.
  whatsappEntitled: boolean;
  metaAppId: string;
  // Facebook Login for Business "WhatsApp Embedded Signup" configuration
  // (v4) and Twilio's Partner Solution ID -- both come from the Meta App
  // Dashboard / Twilio integration guide, see .env.example.
  twilioConfigId: string;
  partnerSolutionId: string;
}) {
  const t = useTranslations("MyAgents.channelsTwilio");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [view, setView] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  // What the merchant typed when they opened Meta's popup, kept in refs so the
  // window `message` listener (registered once) always reads the current
  // values instead of the ones from the render it was created in.
  const form = useRef({ phoneNumber: "", displayName: "" });
  const submitted = useRef(false);
  const statusUrl = `/api/companies/${companyId}/agents/${agentSlug}/whatsapp`;

  const submit = useCallback(
    (wabaId: string) => {
      if (submitted.current) return;
      submitted.current = true;
      setView("registering");
      fetch(`${statusUrl}/twilio/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId, phoneNumber: form.current.phoneNumber, displayName: form.current.displayName }),
      })
        .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => {
          submitted.current = false;
          if (!ok) {
            const known: Record<string, string> = {
              invalid_phone_number: t("errorInvalidPhone"),
              whatsapp_number_connected_elsewhere: t("errorNumberElsewhere"),
              whatsapp_number_connected_to_other_agent: t("errorNumberOtherMember"),
              whatsapp_waba_mismatch: t("errorAccountMismatch"),
            };
            setErrorMessage(known[json?.error as string] ?? t("connectError"));
            setView("idle");
            return;
          }
          setConnection(json.connection);
          setView("idle");
        })
        .catch(() => {
          submitted.current = false;
          setErrorMessage(t("connectError"));
          setView("idle");
        });
    },
    [statusUrl, t],
  );

  useEffect(() => {
    if (!whatsappEntitled) return;
    fetch(statusUrl)
      .then((res) => res.json())
      .then((data: { connection: Connection | null }) => {
        setConnection(data.connection);
        setView("idle");
      })
      .catch(() => setView("idle"));

    window.fbAsyncInit = () => {
      window.FB?.init({ appId: metaAppId, xfbml: true, version: "v21.0", fedCM: false });
    };
    const scriptId = "facebook-jssdk";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      document.body.appendChild(script);
    }

    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" && data.data?.waba_id) {
          submit(data.data.waba_id);
        } else if (data.event === "CANCEL") {
          setView("idle");
        } else if (data.event === "ERROR") {
          setErrorMessage(t("popupError"));
          setView("idle");
        }
      } catch {
        // Not a JSON message we care about.
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [statusUrl, metaAppId, whatsappEntitled, submit, t]);

  // Keep a pending connection fresh: the status route asks Twilio for the
  // sender's current state, so this is what turns "In review" into
  // "Connected" while the merchant watches.
  const isPending = connection?.status === "pending";
  useEffect(() => {
    if (!isPending) return;
    const timer = setInterval(() => {
      fetch(statusUrl)
        .then((res) => res.json())
        .then((data: { connection: Connection | null }) => setConnection(data.connection))
        .catch(() => {
          // Transient -- the next tick tries again.
        });
    }, PENDING_POLL_MS);
    return () => clearInterval(timer);
  }, [isPending, statusUrl]);

  function startSignup() {
    if (!phoneNumber.trim() || !displayName.trim()) {
      setErrorMessage(t("errorMissingFields"));
      return;
    }
    if (!looksLikeE164(phoneNumber)) {
      setErrorMessage(t("errorInvalidPhone"));
      return;
    }
    if (!window.FB) {
      setErrorMessage(t("sdkNotReady"));
      return;
    }
    setErrorMessage(null);
    form.current = { phoneNumber: phoneNumber.trim(), displayName: displayName.trim() };
    submitted.current = false;
    setView("connecting");
    window.FB.login(
      () => {
        // Nothing to read here: with Twilio the popup's result is the FINISH
        // event handled above. If the popup closed and no FINISH ever
        // arrived, the merchant backed out -- put the form back.
        setTimeout(() => {
          if (!submitted.current) setView((current) => (current === "connecting" ? "idle" : current));
        }, 1500);
      },
      {
        config_id: twilioConfigId,
        // Avoids "user is already logged in" errors if the button is clicked
        // again before a refresh.
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: { solutionID: partnerSolutionId } },
      },
    );
  }

  async function confirmDisconnect() {
    setView("disconnecting");
    const res = await fetch(statusUrl, { method: "DELETE" });
    if (!res.ok) {
      setErrorMessage(t("disconnectError"));
      setView("idle");
      return;
    }
    const { connection: updated } = await res.json();
    setConnection(updated);
    setView("idle");
  }

  const isLive = connection?.status === "connected" || connection?.status === "pending";
  const isConnected = connection?.status === "connected";
  const isOffline = isConnected && !!connection?.sender_status && connection.sender_status.toUpperCase() !== "ONLINE";
  const shownNumber = connection?.phone_e164 ?? connection?.display_phone_number;

  if (!whatsappEntitled) {
    return (
      <div className="relative">
        <ChannelPanelHeader
          icon={<WhatsAppIcon className="h-6 w-6" />}
          tileClassName="bg-[#25D366] text-white"
          title={t("title")}
          description={t("description")}
        />
        <div className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-outline-variant/60 bg-surface-container-low p-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
            <LockIcon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-on-surface">{t("addonRequiredTitle")}</h3>
            <p className="mt-1 text-sm text-on-surface-variant">{t("addonRequiredDescription")}</p>
          </div>
          {canEdit ? (
            <Link href="/dashboard/settings/billing">
              <Button type="button" size="sm">
                {t("addonRequiredCta")}
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <ChannelPanelHeader
        icon={<WhatsAppIcon className="h-6 w-6" />}
        tileClassName="bg-[#25D366] text-white"
        title={t("title")}
        description={t("description")}
      />

      <div className="relative mt-6 flex flex-col gap-6">
        {view === "loading" ? (
          <p className="text-sm text-on-surface-variant">{t("loading")}</p>
        ) : (
          <>
            <Step index={1} done={isConnected} title={t("stepOneTitle")}>
              {isLive ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-tertiary-container/30 bg-tertiary-container/10 p-3">
                    {isOffline ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
                        {t("offlineBadge")}
                      </span>
                    ) : isConnected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-tertiary-container/25 px-2.5 py-1 text-xs font-semibold text-on-tertiary-container">
                        {t("connectedBadge")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-1 text-xs font-semibold text-on-primary-fixed">
                        {t("pendingBadge")}
                      </span>
                    )}
                    <span className="text-sm font-medium text-on-surface">{shownNumber}</span>
                  </div>
                  {isPending ? <p className="text-sm text-on-surface-variant">{t("pendingDescription")}</p> : null}
                  {isOffline ? <p className="text-sm text-on-surface-variant">{t("offlineDescription")}</p> : null}
                  {canEdit &&
                    (view === "confirmingDisconnect" || view === "disconnecting" ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm text-on-surface-variant">{t("disconnectConfirm")}</p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          isLoading={view === "disconnecting"}
                          onClick={confirmDisconnect}
                        >
                          {t("disconnectConfirmButton")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={view === "disconnecting"}
                          onClick={() => setView("idle")}
                        >
                          {t("cancel")}
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setView("confirmingDisconnect")}>
                          {t("disconnectButton")}
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-on-surface-variant">{t("notConnected")}</p>
                  <ChannelPreview agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={accent} />
                  {canEdit ? (
                    <>
                      <Alert variant="warning" title={t("numberNoticeTitle")}>
                        {t("numberNoticeBody")}
                      </Alert>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <Input
                            id="whatsapp-phone-number"
                            label={t("numberLabel")}
                            type="tel"
                            inputMode="tel"
                            autoComplete="off"
                            placeholder={t("numberPlaceholder")}
                            value={phoneNumber}
                            disabled={view === "connecting" || view === "registering"}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                          />
                          <p className="mt-1.5 text-xs text-on-surface-variant">{t("numberHint")}</p>
                        </div>
                        <div>
                          <Input
                            id="whatsapp-display-name"
                            label={t("displayNameLabel")}
                            autoComplete="organization"
                            maxLength={100}
                            value={displayName}
                            disabled={view === "connecting" || view === "registering"}
                            onChange={(e) => setDisplayName(e.target.value)}
                          />
                          <p className="mt-1.5 text-xs text-on-surface-variant">{t("displayNameHint")}</p>
                        </div>
                      </div>
                      <p className="text-sm text-on-surface-variant">{t("includedNote")}</p>
                      <div>
                        <Button
                          type="button"
                          isLoading={view === "connecting" || view === "registering"}
                          onClick={startSignup}
                        >
                          {view === "registering" ? t("registering") : view === "connecting" ? t("connecting") : t("connectButton")}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </Step>

            <Step index={2} done={isConnected} muted={!isConnected} title={t("stepTwoTitle")}>
              <p className="text-sm text-on-surface-variant">{t("stepTwoDescription")}</p>
            </Step>
          </>
        )}

        {errorMessage ? (
          <p role="alert" className="text-sm text-error">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  done,
  muted,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 ${muted ? "opacity-50" : ""}`}>
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-sm font-semibold ${
          done ? "bg-tertiary-container text-on-tertiary-container" : "bg-primary-fixed text-on-primary-fixed"
        }`}
      >
        {done ? <CheckIcon className="h-4 w-4" /> : index}
      </span>
      <div className="flex-1">
        <h3 className="mb-1 text-sm font-semibold text-on-surface">{title}</h3>
        {children}
      </div>
    </div>
  );
}
