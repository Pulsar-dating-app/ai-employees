"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// DEV-ONLY -- see page.tsx. Real Google Identity Services popup code
// client, matching what K2's real "Connect Google Calendar" button will
// need to do -- not a paste-credentials shortcut like D1's
// manual-connect-test, since I1's connect route was purpose-built around
// this exact flow (redirect_uri: "postmessage" only makes sense for it).
// Requires a real GOOGLE_CLIENT_ID in .env.local (see the setup steps this
// session's plan walked through) -- googleClientId is null until then.

type Connection = { status: string; google_calendar_id: string | null; connected_at: string | null } | null;

// Minimal shape of what we call on the Google Identity Services global --
// no @types package for this is installed, and it's dev-only scaffolding,
// so a narrow inline type beats pulling in a dependency for one file.
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

export function CalendarSection({
  companyId,
  googleClientId,
}: {
  companyId: string;
  googleClientId: string | null;
}) {
  const [connection, setConnection] = useState<Connection>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  // 2026-09-24 -- Google Calendar is per professional; this dev harness
  // drives the company's first active one.
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);

  async function refresh() {
    if (!calendarUrl) return;
    const res = await fetch(calendarUrl);
    const body = await res.json().catch(() => null);
    setConnection(body?.connection ?? null);
  }

  useEffect(() => {
    fetch(`/api/companies/${companyId}/professionals`)
      .then((res) => res.json())
      .then(async (body: { professionals?: { id: string; isActive: boolean }[] }) => {
        const first = body.professionals?.find((p) => p.isActive);
        if (!first) return;
        const url = `/api/companies/${companyId}/professionals/${first.id}/calendar`;
        setCalendarUrl(url);
        const res = await fetch(url);
        const data = (await res.json()) as { connection?: Connection };
        setConnection(data?.connection ?? null);
      })
      .catch(() => setConnection(null));
  }, [companyId]);

  function connect() {
    if (!googleClientId || !window.google || !calendarUrl) return;
    setStatus("Opening Google's consent popup...");

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: googleClientId,
      scope: "https://www.googleapis.com/auth/calendar",
      ux_mode: "popup",
      callback: async (response) => {
        if (!response.code) {
          setStatus(`Google popup did not return a code (${response.error ?? "cancelled"}).`);
          return;
        }
        const res = await fetch(`${calendarUrl}/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: response.code }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setStatus(`Connect failed: ${body?.error ?? res.status}`);
          return;
        }
        setStatus("Connected.");
        refresh();
      },
    });
    client.requestCode();
  }

  async function disconnect() {
    if (!calendarUrl) return;
    await fetch(calendarUrl, { method: "DELETE" });
    setStatus(null);
    refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Google Calendar connect (I1)</CardTitle>
      </CardHeader>
      <CardContent>
        <Script src="https://accounts.google.com/gsi/client" onLoad={() => setScriptReady(true)} />

        {!googleClientId ? (
          <p className="text-sm text-error">
            GOOGLE_CLIENT_ID is not set in .env.local — add real Google OAuth credentials and restart the
            dev server to test this section.
          </p>
        ) : (
          <>
            <p className="text-sm text-on-surface">
              Status: {connection?.status ?? "not connected"}
              {connection?.google_calendar_id ? ` — calendar: ${connection.google_calendar_id}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={connect} disabled={!scriptReady}>
                Connect Google Calendar
              </Button>
              <Button size="sm" variant="secondary" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
            {status ? <p className="text-sm text-on-surface-variant">{status}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
