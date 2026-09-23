"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { CheckIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsBlock } from "@/components/ui/settings-block";
import { useSectionStatus } from "./settings-shell";

type GoogleCodeClient = { requestCode: () => void };
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            callback: (response: { code?: string; error?: string }) => void;
            error_callback?: (error: { type?: string }) => void;
          }): GoogleCodeClient;
        };
      };
    };
  }
}

type Connection = {
  status: "pending" | "connected" | "disconnected";
  google_calendar_id: string | null;
  connected_at: string | null;
} | null;

type View = "loading" | "idle" | "connecting" | "disconnecting" | "confirmingDisconnect";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function GoogleCalendarCard({
  companyId,
  isAdmin,
  googleClientId,
}: {
  companyId: string;
  isAdmin: boolean;
  googleClientId: string | null;
}) {
  const t = useTranslations("Scheduling.settings.googleCalendar");
  const tn = useTranslations("Scheduling.settings.nav");
  const [connection, setConnection] = useState<Connection>(null);
  const [view, setView] = useState<View>("loading");
  const [scriptReady, setScriptReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const codeClient = useRef<GoogleCodeClient | null>(null);

  useEffect(() => {
    fetch(`/api/companies/${companyId}/calendar`)
      .then((res) => res.json())
      .then((body: { connection?: Connection }) => {
        setConnection(body?.connection ?? null);
        setView("idle");
      })
      .catch(() => setView("idle"));
  }, [companyId]);

  function startConnect() {
    if (!googleClientId || !window.google || !scriptReady) {
      setErrorMessage(t("sdkNotReady"));
      return;
    }
    setErrorMessage(null);
    setView("connecting");

    if (!codeClient.current) {
      codeClient.current = window.google.accounts.oauth2.initCodeClient({
        client_id: googleClientId,
        scope: CALENDAR_SCOPE,
        ux_mode: "popup",
        error_callback: () => setView("idle"),
        callback: async (response) => {
          if (!response.code) {
            setView("idle");
            return;
          }
          try {
            const res = await fetch(`/api/companies/${companyId}/calendar/connect`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: response.code }),
            });
            if (!res.ok) {
              setErrorMessage(t("connectError"));
              setView("idle");
              return;
            }
            const { connection: updated } = await res.json();
            setConnection(updated ?? null);
            setView("idle");
          } catch {
            setErrorMessage(t("connectError"));
            setView("idle");
          }
        },
      });
    }
    codeClient.current.requestCode();
  }

  async function confirmDisconnect() {
    setView("disconnecting");
    try {
      const res = await fetch(`/api/companies/${companyId}/calendar`, { method: "DELETE" });
      if (!res.ok) {
        setErrorMessage(t("disconnectError"));
        setView("idle");
        return;
      }
      const { connection: updated } = await res.json();
      setConnection(updated ?? null);
      setView("idle");
    } catch {
      setErrorMessage(t("disconnectError"));
      setView("idle");
    }
  }

  const isConnected = connection?.status === "connected";
  const loading = view === "loading";
  const available = Boolean(googleClientId);

  useSectionStatus(
    "google-calendar",
    loading
      ? null
      : {
          summary: !available
            ? tn("calendarUnavailable")
            : isConnected
              ? tn("calendarConnected")
              : tn("calendarNotConnected"),
          warn: available && !isConnected,
        },
  );

  return (
    <SettingsBlock
      id="google-calendar"
      title={t("title")}
      description={t("subtitle")}
      aside={
        loading || !available ? null : (
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold",
              isConnected ? "bg-success-100 text-success-500" : "bg-surface-container text-on-surface-variant",
            )}
          >
            <span
              aria-hidden="true"
              className={clsx("h-1.5 w-1.5 rounded-full", isConnected ? "bg-success-500" : "bg-outline")}
            />
            {isConnected ? tn("calendarConnected") : tn("calendarNotConnected")}
          </span>
        )
      }
    >
      <Script src="https://accounts.google.com/gsi/client" onReady={() => setScriptReady(true)} />

      {loading ? (
        <div aria-busy="true" className="flex min-h-44 flex-col gap-5">
          <span className="sr-only">{t("loading")}</span>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-7 w-7 rounded-full" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : !available ? (
        <p className="text-sm text-on-surface-variant">{t("notConfigured")}</p>
      ) : (
        <ol className="flex flex-col gap-5">
          <Step index={1} done={isConnected} title={t("stepOneTitle")}>
            {isConnected ? (
              <div className="flex flex-col items-start gap-3">
                {connection?.connected_at ? (
                  <p className="text-sm text-on-surface-variant">
                    {t("connectedSince", { date: new Date(connection.connected_at).toLocaleDateString() })}
                  </p>
                ) : null}
                {isAdmin ? (
                  view === "confirmingDisconnect" || view === "disconnecting" ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-container-low px-4 py-3">
                      <p className="text-sm text-on-surface">{t("disconnectConfirm")}</p>
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
                    <Button type="button" variant="secondary" size="sm" onClick={() => setView("confirmingDisconnect")}>
                      {t("disconnectButton")}
                    </Button>
                  )
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-on-surface-variant">{t("notConnected")}</p>
                {isAdmin ? (
                  <>
                    <Button
                      type="button"
                      isLoading={view === "connecting"}
                      disabled={!scriptReady}
                      onClick={startConnect}
                    >
                      {view === "connecting" ? t("connecting") : t("connectButton")}
                    </Button>
                    <p className="text-[13px] text-on-surface-variant">
                      {t("privacyNotice")}{" "}
                      <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                        {t("privacyNoticeLink")}
                      </Link>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-on-surface-variant">{t("adminOnly")}</p>
                )}
              </div>
            )}
          </Step>

          <Step index={2} done={isConnected} muted={!isConnected} title={t("stepTwoTitle")}>
            <p className="text-sm text-on-surface-variant">{t("stepTwoDescription")}</p>
          </Step>
        </ol>
      )}

      {errorMessage ? (
        <p role="alert" className="text-sm text-error">
          {errorMessage}
        </p>
      ) : null}
    </SettingsBlock>
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
    <li className={clsx("flex gap-4 transition-opacity", muted && "opacity-55")}>
      <span
        className={clsx(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition-colors",
          done ? "bg-success-100 text-success-500" : "bg-primary-fixed text-primary",
        )}
      >
        {done ? <CheckIcon className="h-3.5 w-3.5" /> : index}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className="mb-1.5 text-sm font-semibold text-on-surface">{title}</h3>
        {children}
      </div>
    </li>
  );
}
