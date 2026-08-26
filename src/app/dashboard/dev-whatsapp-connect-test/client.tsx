"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// TODO(D1-TEST-ONLY): delete this entire folder once F4 ships its real
// connection screen -- it is not merchant-facing (no i18n, no design
// system, not spec-compliant copy) and must never be the shipped UI.
//
// TEMPORARY DEV-ONLY TEST HARNESS -- Trello D1.
//
// D1 only built the backend (POST .../whatsapp/connect); the real "Connect
// WhatsApp" screen is Trello F4, not built yet. Until then, there's no
// merchant-facing way to trigger Meta's Embedded Signup popup and get the
// {code, waba_id, phone_number_id} the connect endpoint needs. This page is
// a throwaway stand-in for that popup trigger, so D1 can be validated
// end-to-end against the real Meta Graph API before F4 exists.
//
// metaAppId/metaConfigId come from
// the parent Server Component (page.tsx) reading server-only env vars --
// see .env.example for why there's no separate NEXT_PUBLIC_ copy of these.

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

type Company = { id: string; name: string | null };

export function DevWhatsAppConnectTestClient({
  metaAppId,
  metaConfigId,
}: {
  metaAppId: string;
  metaConfigId: string;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const pendingSignup = useRef<{ code?: string; phoneNumberId?: string; wabaId?: string }>({});
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [manualPhoneNumberId, setManualPhoneNumberId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");

  function appendLog(line: string) {
    setLog((prev) => [...prev, line]);
  }

  useEffect(() => {
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data: { companies: Company[] }) => {
        setCompanies(data.companies ?? []);
        if (data.companies?.[0]) setCompanyId(data.companies[0].id);
      })
      .catch((err) => appendLog(`Failed to load companies: ${err}`));

    window.fbAsyncInit = () => {
      window.FB?.init({ appId: metaAppId, xfbml: true, version: "v21.0" });
      appendLog("Facebook SDK initialized.");
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
        appendLog(`Embedded Signup event: ${JSON.stringify(data)}`);
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
  }, [metaAppId]);

  function maybeSubmit() {
    const { code, phoneNumberId, wabaId } = pendingSignup.current;
    if (!code || !phoneNumberId || !wabaId || !companyId) return;

    appendLog(`Posting to /api/companies/${companyId}/whatsapp/connect ...`);
    fetch(`/api/companies/${companyId}/whatsapp/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, phoneNumberId, wabaId }),
    })
      .then((res) => res.json().then((json) => ({ status: res.status, json })))
      .then(({ status, json }) => {
        appendLog(`Connect response: ${status}`);
        setResult(json);
        pendingSignup.current = {};
      })
      .catch((err) => appendLog(`Connect request failed: ${err}`));
  }

  function startSignup() {
    if (!window.FB) {
      appendLog("Facebook SDK not ready yet.");
      return;
    }
    pendingSignup.current = {};
    window.FB.login(
      (response) => {
        appendLog(`FB.login response: ${JSON.stringify(response)}`);
        pendingSignup.current.code = response.authResponse?.code;
        maybeSubmit();
      },
      {
        config_id: metaConfigId,
        response_type: "code",
        override_default_response_type: true,
        // Embedded Signup v4 -- extras is just { setup: {} }; v2's
        // featureType/sessionInfoVersion fields don't apply here.
        extras: { setup: {} },
      },
    );
  }

  function manualConnect() {
    if (!companyId || !manualAccessToken || !manualPhoneNumberId || !manualWabaId) {
      appendLog("Manual connect: fill company, accessToken, phoneNumberId, and wabaId first.");
      return;
    }
    appendLog(`Posting to /api/companies/${companyId}/whatsapp/manual-connect-test ...`);
    fetch(`/api/companies/${companyId}/whatsapp/manual-connect-test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accessToken: manualAccessToken,
        phoneNumberId: manualPhoneNumberId,
        wabaId: manualWabaId,
      }),
    })
      .then((res) => res.json().then((json) => ({ status: res.status, json })))
      .then(({ status, json }) => {
        appendLog(`Manual connect response: ${status}`);
        setResult(json);
      })
      .catch((err) => appendLog(`Manual connect request failed: ${err}`));
  }

  function checkStatus() {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}/whatsapp`)
      .then((res) => res.json().then((json) => ({ status: res.status, json })))
      .then(({ status, json }) => {
        appendLog(`Status response: ${status}`);
        setResult(json);
      })
      .catch((err) => appendLog(`Status request failed: ${err}`));
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, fontFamily: "monospace" }}>
      <p style={{ background: "#fee2e2", padding: 12, marginBottom: 16 }}>
        DEV-ONLY TEST PAGE (Trello D1) -- delete this folder once Trello F4 ships the real
        WhatsApp connection screen.
      </p>
      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>

      <label>
        Company:{" "}
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? c.id}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button onClick={startSignup}>Start WhatsApp Embedded Signup</button>
        <button onClick={checkStatus}>Check connection status</button>
      </div>

      <h3 style={{ marginTop: 24 }}>
        Manual connect (no Embedded Signup / Advanced Access needed)
      </h3>
      <p>
        Paste values from Meta App Dashboard → WhatsApp → API Setup (the free test number Meta
        gives every app — works before Advanced Access / Business Verification is approved).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
        <input
          placeholder="Access token"
          value={manualAccessToken}
          onChange={(e) => setManualAccessToken(e.target.value)}
        />
        <input
          placeholder="Phone number ID"
          value={manualPhoneNumberId}
          onChange={(e) => setManualPhoneNumberId(e.target.value)}
        />
        <input
          placeholder="WABA ID"
          value={manualWabaId}
          onChange={(e) => setManualWabaId(e.target.value)}
        />
        <button onClick={manualConnect}>Connect with these values</button>
      </div>

      <h3 style={{ marginTop: 24 }}>Result</h3>
      <pre style={{ background: "#f5f5f4", padding: 12, overflowX: "auto" }}>
        {JSON.stringify(result, null, 2)}
      </pre>

      <h3>Log</h3>
      <pre style={{ background: "#f5f5f4", padding: 12, overflowX: "auto" }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}
