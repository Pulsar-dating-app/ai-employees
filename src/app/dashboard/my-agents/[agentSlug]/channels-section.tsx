"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { WhatsAppIcon, CheckIcon, LockIcon } from "@/components/ui/icons";
import { ChannelPanelHeader } from "./channel-panel-header";
import { ChannelPreview } from "./channel-preview";
import { useReportChannelStatus } from "./channel-status";

const PENDING_POLL_MS = 5000;

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
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string | null;
  status: "pending" | "connected" | "disconnected";
  connected_at: string | null;
  has_payment_issue: boolean;
  payment_issue_detected_at: string | null;
  twilio_sender_status: string | null;
};

type ViewState = "loading" | "idle" | "connecting" | "disconnecting" | "confirmingDisconnect" | "verifying";

// The real merchant-facing WhatsApp connect screen — Meta Embedded Signup
// (D1's backend), presented with a two-step setup guide. Connect/disconnect
// mechanics are unchanged; routes moved under [agentSlug] on 2026-09-04
// (migration 20260905090000 made the connection per-agent, mirroring
// Instagram's N1).
export function ChannelsSection({
  companyId,
  agentSlug,
  agentName,
  agentPhotoSrc,
  accent,
  canEdit,
  whatsappEntitled,
  metaAppId,
  metaConfigId,
  metaSolutionId,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  agentPhotoSrc: string | null;
  accent: string;
  canEdit: boolean;
  // 2026-09-22 -- whether the company's plan includes the WhatsApp add-on
  // (a `_wpp` plan variant, plans.ts). `false` renders a locked upsell
  // instead of the connect flow below, regardless of `canEdit` or any
  // connection that might already exist from before a Portal downgrade --
  // the server-side gates (connect route + inbound webhook,
  // decideWhatsappPlanGate) are the real enforcement; this is the UI half
  // so a merchant without the add-on isn't shown a connect button that
  // would just 403, or led to believe a stale connection is still live.
  whatsappEntitled: boolean;
  metaAppId: string;
  metaConfigId: string;
  metaSolutionId: string;
}) {
  const t = useTranslations("MyAgents.channels");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [view, setView] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const pendingSignup = useRef<{ code?: string; phoneNumberId?: string; wabaId?: string }>({});
  const statusUrl = `/api/companies/${companyId}/agents/${agentSlug}/whatsapp`;

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
        if (data.event === "FINISH") {
          pendingSignup.current.phoneNumberId = data.data?.phone_number_id;
          pendingSignup.current.wabaId = data.data?.waba_id;
          maybeSubmit();
        }
      } catch {
        // Not a JSON message we care about.
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusUrl, metaAppId]);

  const isPending = connection?.status === "pending";
  useEffect(() => {
    if (!isPending) return;
    const interval = setInterval(() => {
      fetch(statusUrl)
        .then((res) => res.json())
        .then((data: { connection: Connection | null }) => setConnection(data.connection))
        .catch(() => {});
    }, PENDING_POLL_MS);
    return () => clearInterval(interval);
  }, [isPending, statusUrl]);

  function maybeSubmit() {
    const { code, phoneNumberId, wabaId } = pendingSignup.current;
    if (!code || !wabaId || !phoneNumberId) return;

    fetch(`${statusUrl}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, phoneNumberId, wabaId }),
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        pendingSignup.current = {};
        if (!ok) {
          setErrorMessage(t("connectError"));
          setView("idle");
          return;
        }
        setConnection(json.connection);
        setView("idle");
      })
      .catch(() => {
        pendingSignup.current = {};
        setErrorMessage(t("connectError"));
        setView("idle");
      });
  }

  function startSignup() {
    if (!window.FB) {
      setErrorMessage(t("sdkNotReady"));
      return;
    }
    setErrorMessage(null);
    setView("connecting");
    pendingSignup.current = {};
    window.FB.login(
      (response) => {
        if (!response.authResponse?.code) {
          setView("idle");
          return;
        }
        pendingSignup.current.code = response.authResponse.code;
        maybeSubmit();
      },
      {
        config_id: metaConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: { solutionID: metaSolutionId }, version: "v4", sessionInfoVersion: "3" },
      },
    );
  }

  async function submitVerificationCode() {
    setErrorMessage(null);
    setView("verifying");
    const res = await fetch(statusUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationCode }),
    }).catch(() => null);
    if (!res?.ok) {
      setErrorMessage(t("verificationError"));
      setView("idle");
      return;
    }
    const { connection: updated } = await res.json();
    setConnection(updated);
    setVerificationCode("");
    setView("idle");
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

  const isConnected = connection?.status === "connected";
  const needsVerification = isPending && connection?.twilio_sender_status === "PENDING_VERIFICATION";
  const activationFailed = isPending && connection?.twilio_sender_status === "OFFLINE";
  // D5: a connected number Meta has flagged for a payment issue can't
  // deliver anything -- distinct from "not connected", since the merchant
  // already completed Embedded Signup and needs a different fix (add a
  // payment method in Meta Business Manager), not to reconnect.
  const hasPaymentIssue = isConnected && connection?.has_payment_issue === true;
  const tHub = useTranslations("MyAgents.channelHub.status");
  useReportChannelStatus(
    "whatsapp",
    !whatsappEntitled
      ? { tone: "locked", label: tHub("notInPlan") }
      : view === "loading"
        ? null
        : hasPaymentIssue
          ? { tone: "warn", label: tHub("paymentIssue") }
          : activationFailed
            ? { tone: "warn", label: tHub("activationFailed") }
            : isPending
            ? {
                tone: "warn",
                label: tHub("activating", { detail: connection?.display_phone_number ?? "" }),
              }
            : isConnected
            ? {
                tone: "ok",
                label: connection?.display_phone_number
                  ? tHub("connectedTo", { detail: connection.display_phone_number })
                  : tHub("connected"),
              }
            : { tone: "off", label: tHub("notConnected") },
  );

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
              {isConnected ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-lg border border-tertiary-container/30 bg-tertiary-container/10 p-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-tertiary-container/25 px-2.5 py-1 text-xs font-semibold text-on-tertiary-container">
                      {t("connectedBadge")}
                    </span>
                    <span className="text-sm font-medium text-on-surface">{connection?.display_phone_number}</span>
                  </div>
                  {hasPaymentIssue ? (
                    <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-3">
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
                        {t("paymentIssueBadge")}
                      </span>
                      <p className="text-sm text-on-surface-variant">{t("paymentIssueDescription")}</p>
                    </div>
                  ) : null}
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
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setView("confirmingDisconnect")}
                        >
                          {t("disconnectButton")}
                        </Button>
                      </div>
                    ))}
                </div>
              ) : isPending ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-lg border border-outline-variant/60 bg-surface-container-low p-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                      {t("pendingBadge")}
                    </span>
                    <span className="text-sm font-medium text-on-surface">{connection?.display_phone_number}</span>
                  </div>
                  {activationFailed ? (
                    <>
                      <p className="text-sm text-on-surface-variant">{t("activationFailedDescription")}</p>
                      {canEdit ? (
                        <div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            isLoading={view === "disconnecting"}
                            onClick={confirmDisconnect}
                          >
                            {t("activationRetry")}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : needsVerification ? (
                    canEdit ? (
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitVerificationCode();
                        }}
                      >
                        <label htmlFor="whatsapp-verification-code" className="text-sm text-on-surface-variant">
                          {t("verificationDescription", { number: connection?.display_phone_number ?? "" })}
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            id="whatsapp-verification-code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                            placeholder={t("verificationCodePlaceholder")}
                            className="w-36 rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface"
                          />
                          <Button type="submit" size="sm" isLoading={view === "verifying"} disabled={verificationCode.length < 4}>
                            {t("verificationSubmit")}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-sm text-on-surface-variant">{t("verificationWaitingForAdmin")}</p>
                    )
                  ) : (
                    <p className="text-sm text-on-surface-variant">{t("pendingDescription")}</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-on-surface-variant">{t("notConnected")}</p>
                  <ChannelPreview agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={accent} />
                  {canEdit ? (
                    <>
                      <Alert variant="info" title={t("billingIncludedTitle")}>
                        {t("billingIncludedDescription")}
                      </Alert>
                      <div>
                        <Button
                          type="button"
                          isLoading={view === "connecting"}
                          onClick={startSignup}
                        >
                          {view === "connecting" ? t("connecting") : t("connectButton")}
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
