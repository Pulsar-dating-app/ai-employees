"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; xfbml: boolean; version: string }) => void;
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
};

type ViewState = "loading" | "idle" | "connecting" | "disconnecting" | "confirmingDisconnect";

// F4 — the real merchant-facing WhatsApp connect screen. Replaces the
// throwaway dev-whatsapp-connect-test harness with the same underlying Meta
// Embedded Signup mechanics (D1's backend), but design-system UI, i18n
// copy, and no manual/debug controls.
export function ChannelsSection({
  companyId,
  canEdit,
  metaAppId,
  metaConfigId,
}: {
  companyId: string;
  canEdit: boolean;
  metaAppId: string;
  metaConfigId: string;
}) {
  const t = useTranslations("MyAgents.channels");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [view, setView] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingSignup = useRef<{ code?: string; phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    fetch(`/api/companies/${companyId}/whatsapp`)
      .then((res) => res.json())
      .then((data: { connection: Connection | null }) => {
        setConnection(data.connection);
        setView("idle");
      })
      .catch(() => setView("idle"));

    window.fbAsyncInit = () => {
      window.FB?.init({ appId: metaAppId, xfbml: true, version: "v21.0" });
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
  }, [companyId, metaAppId]);

  function maybeSubmit() {
    const { code, phoneNumberId, wabaId } = pendingSignup.current;
    if (!code || !phoneNumberId || !wabaId) return;

    fetch(`/api/companies/${companyId}/whatsapp/connect`, {
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
        extras: { setup: {} },
      },
    );
  }

  async function confirmDisconnect() {
    setView("disconnecting");
    const res = await fetch(`/api/companies/${companyId}/whatsapp`, { method: "DELETE" });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {view === "loading" ? (
          <p className="text-sm text-neutral-500">{t("loading")}</p>
        ) : isConnected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 p-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-100 px-2.5 py-1 text-xs font-semibold text-success-500">
                {t("connectedBadge")}
              </span>
              <span className="text-sm font-medium text-neutral-900">
                {connection?.display_phone_number}
              </span>
            </div>

            {canEdit ? (
              view === "confirmingDisconnect" || view === "disconnecting" ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-neutral-600">{t("disconnectConfirm")}</p>
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
              )
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-600">{t("notConnected")}</p>
            {canEdit ? (
              <div>
                <Button type="button" isLoading={view === "connecting"} onClick={startSignup}>
                  {view === "connecting" ? t("connecting") : t("connectButton")}
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {errorMessage ? (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
