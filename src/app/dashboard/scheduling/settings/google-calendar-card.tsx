"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";
import { LinkIcon, CheckIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./settings-section";

// Google Identity Services popup code client. Keep this shape identical to
// the one dev-scheduling-test/calendar-section.tsx declares — TypeScript
// merges the two `declare global` augmentations and a mismatch would error.
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

// Trello K2 — the real "Connect Google Calendar" card over I1's backend
// (GET / POST connect / DELETE /api/companies/[id]/calendar), in the same
// shape as My Team's WhatsApp channels-section.tsx: a two-step guide with
// loading / not-connected / connected / disconnect-confirm / error states.
// Connect and disconnect are admin-only, matching I1's routes — unlike K3's
// other settings cards, which are member-level.
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
  const [connection, setConnection] = useState<Connection>(null);
  const [view, setView] = useState<View>("loading");
  const [scriptReady, setScriptReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const codeClient = useRef<GoogleCodeClient | null>(null);
  const didScrollToAnchor = useRef(false);

  useEffect(() => {
    fetch(`/api/companies/${companyId}/calendar`)
      .then((res) => res.json())
      .then((body: { connection?: Connection }) => {
        setConnection(body?.connection ?? null);
        setView("idle");
      })
      .catch(() => setView("idle"));
  }, [companyId]);

  // This card is last on a long page, so the Appointments rail links here
  // with #google-calendar. The App Router's native hash scroll fires against
  // the loading.tsx skeleton (before this content mounts) and misses, so do
  // it in JS once the card has rendered its real state.
  useEffect(() => {
    if (didScrollToAnchor.current || view === "loading") return;
    if (window.location.hash !== "#google-calendar") return;
    didScrollToAnchor.current = true;
    document
      .getElementById("google-calendar")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);

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
        // Closing the popup fires this, not `callback` — without it `view`
        // would stay "connecting" and the button stuck on its spinner.
        error_callback: () => setView("idle"),
        callback: async (response) => {
          if (!response.code) {
            // Popup dismissed or denied — back to idle, no error banner.
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

  return (
    <SettingsSection
      id="google-calendar"
      icon={LinkIcon}
      iconTone="secondary"
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {/* `onReady`, not `onLoad`: onLoad only fires the first time the script
          loads, so after a disconnect + remount (script already cached) the
          button would stay disabled. onReady fires on every mount. */}
      <Script src="https://accounts.google.com/gsi/client" onReady={() => setScriptReady(true)} />

      {view === "loading" ? (
        <p className="text-sm text-on-surface-variant">{t("loading")}</p>
      ) : !googleClientId ? (
        <p className="text-sm text-on-surface-variant">{t("notConfigured")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          <Step index={1} done={isConnected} title={t("stepOneTitle")}>
            {isConnected ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-outline-variant/40 p-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container/40 px-2.5 py-1 text-xs font-semibold text-on-secondary-container">
                    {t("connectedBadge")}
                  </span>
                  {connection?.connected_at ? (
                    <span className="text-sm text-on-surface-variant">
                      {t("connectedSince", {
                        date: new Date(connection.connected_at).toLocaleDateString(),
                      })}
                    </span>
                  ) : null}
                </div>
                {isAdmin ? (
                  view === "confirmingDisconnect" || view === "disconnecting" ? (
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
                  )
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-on-surface-variant">{t("notConnected")}</p>
                {isAdmin ? (
                  <div>
                    <Button
                      type="button"
                      isLoading={view === "connecting"}
                      disabled={!scriptReady}
                      onClick={startConnect}
                    >
                      {view === "connecting" ? t("connecting") : t("connectButton")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant">{t("adminOnly")}</p>
                )}
              </div>
            )}
          </Step>

          <Step index={2} done={isConnected} muted={!isConnected} title={t("stepTwoTitle")}>
            <p className="text-sm text-on-surface-variant">{t("stepTwoDescription")}</p>
          </Step>

          {errorMessage ? (
            <p role="alert" className="text-sm text-error">
              {errorMessage}
            </p>
          ) : null}
        </div>
      )}
    </SettingsSection>
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
          done
            ? "bg-tertiary-container text-on-tertiary-container"
            : "bg-primary-fixed text-on-primary-fixed"
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
