"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { CheckIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CHEVRON } from "@/components/ui/select";
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

type CalendarOption = { id: string; name: string; primary: boolean };

type View = "loading" | "idle" | "connecting" | "disconnecting" | "confirmingDisconnect";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

const SELECT_CLASSES =
  "h-11 w-full min-w-0 rounded-xl border border-outline-variant/70 bg-surface-container-lowest pl-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] disabled:cursor-not-allowed disabled:opacity-60";

// One professional's Google Calendar (2026-09-24: each professional connects
// their own account and picks which of its calendars holds their
// appointments). Used on the professional's page, and on Scheduling settings
// when the business has a single professional -- which keeps that screen
// exactly as it was before multiple schedules existed.
export function GoogleCalendarCard({
  companyId,
  professionalId,
  canManage,
  googleClientId,
  title,
  description,
}: {
  companyId: string;
  professionalId: string;
  // Company owner/admin, or the team member linked to this professional.
  canManage: boolean;
  googleClientId: string | null;
  title?: string;
  description?: string;
}) {
  const t = useTranslations("Scheduling.settings.googleCalendar");
  const tn = useTranslations("Scheduling.settings.nav");
  const [connection, setConnection] = useState<Connection>(null);
  const [view, setView] = useState<View>("loading");
  const [scriptReady, setScriptReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<CalendarOption[] | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarNote, setCalendarNote] = useState<string | null>(null);
  const codeClient = useRef<GoogleCodeClient | null>(null);
  const baseUrl = `/api/companies/${companyId}/professionals/${professionalId}/calendar`;

  useEffect(() => {
    fetch(baseUrl)
      .then((res) => res.json())
      .then((body: { connection?: Connection }) => {
        setConnection(body?.connection ?? null);
        setView("idle");
      })
      .catch(() => setView("idle"));
  }, [baseUrl]);

  const isConnected = connection?.status === "connected";

  // The connected account's calendars, for the picker -- loaded once the
  // connection is live (and again after a reconnect resets the list).
  useEffect(() => {
    if (!isConnected || !canManage || calendars !== null) return;
    let cancelled = false;
    fetch(`${baseUrl}/calendars`)
      .then((res) => (res.ok ? res.json() : { calendars: [] }))
      .then((body: { calendars?: CalendarOption[] }) => {
        if (!cancelled) setCalendars(body.calendars ?? []);
      })
      .catch(() => {
        if (!cancelled) setCalendars([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, canManage, calendars, baseUrl]);

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
            const res = await fetch(`${baseUrl}/connect`, {
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
            setCalendars(null);
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
      const res = await fetch(baseUrl, { method: "DELETE" });
      if (!res.ok) {
        setErrorMessage(t("disconnectError"));
        setView("idle");
        return;
      }
      const { connection: updated } = await res.json();
      setConnection(updated ?? null);
      setCalendars(null);
      setView("idle");
    } catch {
      setErrorMessage(t("disconnectError"));
      setView("idle");
    }
  }

  async function chooseCalendar(googleCalendarId: string) {
    setCalendarBusy(true);
    setCalendarNote(null);
    try {
      const res = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleCalendarId }),
      });
      if (!res.ok) {
        setCalendarNote(t("calendarError"));
      } else {
        const { connection: updated } = await res.json();
        setConnection(updated ?? connection);
        setCalendarNote(t("calendarSaved"));
      }
    } catch {
      setCalendarNote(t("calendarError"));
    }
    setCalendarBusy(false);
  }

  async function createCalendar() {
    setCalendarBusy(true);
    setCalendarNote(null);
    try {
      const res = await fetch(`${baseUrl}/calendars`, { method: "POST" });
      if (!res.ok) {
        setCalendarNote(t("calendarError"));
      } else {
        const { calendar } = (await res.json()) as { calendar: CalendarOption };
        setCalendars((prev) => [...(prev ?? []), calendar]);
        setConnection((prev) => (prev ? { ...prev, google_calendar_id: calendar.id } : prev));
        setCalendarNote(t("calendarCreated", { name: calendar.name }));
      }
    } catch {
      setCalendarNote(t("calendarError"));
    }
    setCalendarBusy(false);
  }

  const loading = view === "loading";
  const available = Boolean(googleClientId);
  const selectedCalendar = connection?.google_calendar_id ?? "primary";
  const primaryCalendar = calendars?.find((c) => c.primary);
  const calendarValue = selectedCalendar === "primary" && primaryCalendar ? primaryCalendar.id : selectedCalendar;

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
      title={title ?? t("title")}
      description={description ?? t("subtitle")}
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
                {canManage ? (
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
                {canManage ? (
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

          {isConnected && canManage ? (
            <Step index={2} done={calendars !== null} title={t("calendarTitle")}>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-on-surface-variant">{t("calendarHint")}</p>
                {calendars === null ? (
                  <Skeleton className="h-11 w-full max-w-md" />
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      aria-label={t("calendarLabel")}
                      className={clsx(SELECT_CLASSES, CHEVRON, "sm:max-w-md")}
                      value={calendarValue}
                      disabled={calendarBusy || calendars.length === 0}
                      onChange={(e) => void chooseCalendar(e.target.value)}
                    >
                      {calendars.some((c) => c.id === calendarValue) ? null : (
                        <option value={calendarValue}>{calendarValue === "primary" ? t("primaryCalendar") : calendarValue}</option>
                      )}
                      {calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.primary ? `${c.name} (${t("primaryCalendar")})` : c.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="secondary" size="sm" isLoading={calendarBusy} onClick={createCalendar}>
                      {t("createCalendar")}
                    </Button>
                  </div>
                )}
                {calendarNote ? (
                  <p role="status" className="text-[13px] text-on-surface-variant">
                    {calendarNote}
                  </p>
                ) : null}
              </div>
            </Step>
          ) : null}

          <Step
            index={isConnected && canManage ? 3 : 2}
            done={isConnected}
            muted={!isConnected}
            title={t("stepTwoTitle")}
          >
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
