"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { InstagramIcon, CheckIcon } from "@/components/ui/icons";

// Trello N3 -- the Instagram equivalent of channels-section.tsx's WhatsApp
// card (that one is still in the tree, unmounted -- see decisions.md
// 2026-08-31). The connect step itself is the one real structural
// difference from WhatsApp/Google Calendar's popup-based flows: Business
// Login for Instagram is a genuine full-page redirect (no JS SDK, no
// window.FB/window.google global to wait on), so "Connect Instagram" is a
// plain <a href> to the /connect/start route rather than an onClick handler
// -- there is no client-side "connecting…" state to render, the browser is
// simply navigating away.

type Connection = {
  instagram_user_id: string;
  username: string | null;
  status: "pending" | "connected" | "disconnected";
  connected_at: string | null;
} | null;

type ViewState = "loading" | "idle" | "disconnecting" | "confirmingDisconnect";

export function InstagramConnectCard({
  companyId,
  agentSlug,
  canEdit,
}: {
  companyId: string;
  agentSlug: string;
  canEdit: boolean;
}) {
  const t = useTranslations("MyAgents.instagram");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<Connection>(null);
  const [view, setView] = useState<ViewState>("loading");
  // Read once from the URL the callback route redirected back with --
  // lazy initializers, not an effect, since this is deriving state from
  // props/the URL on mount, not synchronizing with an external system.
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    searchParams.get("instagram_error") ? t("connectError") : null,
  );
  const [justConnected, setJustConnected] = useState(() => searchParams.get("instagram") === "connected");

  const statusUrl = `/api/companies/${companyId}/agents/${agentSlug}/instagram`;

  function refresh() {
    fetch(statusUrl)
      .then((res) => res.json())
      .then((data: { connection: Connection }) => {
        setConnection(data.connection);
        setView("idle");
      })
      .catch(() => setView("idle"));
  }

  useEffect(refresh, [statusUrl]);

  // Strip instagram/instagram_error off the URL once read (state above
  // already captured them on mount) so a page refresh doesn't re-show the
  // banner. No setState here -- this effect only talks to the router.
  useEffect(() => {
    if (searchParams.get("instagram") || searchParams.get("instagram_error")) {
      router.replace(`/dashboard/my-agents/${agentSlug}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setJustConnected(false);
    setView("idle");
  }

  const isConnected = connection?.status === "connected";

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-secondary-container/25 blur-3xl" />

      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white shadow-sm">
          <InstagramIcon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-on-surface">{t("title")}</h2>
          <p className="text-sm text-on-surface-variant">{t("description")}</p>
        </div>
      </div>

      <div className="relative mt-8 flex flex-col gap-6">
        {view === "loading" ? (
          <p className="text-sm text-on-surface-variant">{t("loading")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {isConnected ? (
              <>
                <div className="flex items-center gap-3 rounded-md border border-outline-variant p-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container/40 px-2.5 py-1 text-xs font-semibold text-on-secondary-container">
                    {t("connectedBadge")}
                  </span>
                  <span className="text-sm font-medium text-on-surface">
                    {connection?.username ? `@${connection.username}` : t("connectedNoUsername")}
                  </span>
                </div>
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
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface-variant">{t("notConnected")}</p>
                <ul className="flex flex-col gap-1 text-xs text-on-surface-variant">
                  <li>{t("prereqProfessional")}</li>
                  <li>{t("prereqAllowMessages")}</li>
                </ul>
                {canEdit ? (
                  <div>
                    <a href={`/api/companies/${companyId}/agents/${agentSlug}/instagram/connect/start`}>
                      <Button type="button">{t("connectButton")}</Button>
                    </a>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}

        {justConnected ? (
          <p className="flex items-center gap-1.5 text-sm text-tertiary">
            <CheckIcon className="h-4 w-4" /> {t("connectedBanner")}
          </p>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="text-sm text-error">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
