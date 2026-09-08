"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// The "Connect your store" panel on the products page, a sibling of the CSV
// ImportPanel. Disconnected: a plain GET form that posts the shop domain to
// the OAuth start route (full-page redirect to Shopify, no JS SDK).
// Connected: a "Sync now" button (mirrors ImportPanel's result UI) plus an
// admin-only disconnect.

type ShopifyConnection = {
  shop_domain: string;
  shop_name: string | null;
  currency: string | null;
  scope: string | null;
  status: "pending" | "connected" | "disconnected";
  connected_at: string | null;
  last_synced_at: string | null;
};

type SyncResult = {
  synced: number;
  deactivated: number;
  skipped: { title: string; reason: string }[];
  truncated: boolean;
};

type ShopifyConnectCardProps = {
  companyId: string;
  canManageConnection: boolean;
  onSynced: () => void;
};

const ERROR_KEYS = new Set([
  "invalid_state",
  "denied",
  "invalid_hmac",
  "not_admin",
  "connected_elsewhere",
  "connect_failed",
]);

export function ShopifyConnectCard({ companyId, canManageConnection, onSynced }: ShopifyConnectCardProps) {
  const t = useTranslations("Products.shopify");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [connection, setConnection] = useState<ShopifyConnection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"idle" | "syncing" | "confirmingDisconnect">("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [banner] = useState<{ kind: "success" | "error"; text: string } | null>(() => {
    const ok = searchParams.get("shopify");
    const err = searchParams.get("shopify_error");
    if (ok === "connected") return { kind: "success", text: t("banner.connected") };
    if (err) return { kind: "error", text: t(`banner.${ERROR_KEYS.has(err) ? err : "connect_failed"}`) };
    return null;
  });

  useEffect(() => {
    // Strip the one-shot ?shopify / ?shopify_error params so a refresh
    // doesn't re-show the banner.
    if (searchParams.get("shopify") || searchParams.get("shopify_error")) {
      router.replace("/dashboard/products");
    }
  }, [router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/companies/${companyId}/shopify`)
      .then((res) => (res.ok ? res.json() : { connection: null }))
      .then((json) => {
        if (cancelled) return;
        setConnection(json.connection ?? null);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function handleSync() {
    setError(null);
    setSyncResult(null);
    setView("syncing");
    const res = await fetch(`/api/companies/${companyId}/shopify/sync`, { method: "POST" });
    if (res.ok) {
      const json = (await res.json()) as SyncResult;
      setSyncResult(json);
      setView("idle");
      onSynced();
      // Reflect the new last_synced_at.
      fetch(`/api/companies/${companyId}/shopify`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setConnection(j.connection ?? null));
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setView("idle");
      if (body?.error === "reauth_required") {
        // The stored refresh token is dead -- surface the reconnect form.
        setError(t("reauthError"));
        setConnection(null);
      } else {
        setError(t("syncError"));
      }
    }
  }

  async function handleDisconnect() {
    const res = await fetch(`/api/companies/${companyId}/shopify`, { method: "DELETE" });
    if (res.ok) {
      const json = await res.json();
      setConnection(json.connection ?? null);
      setSyncResult(null);
    }
    setView("idle");
  }

  const isConnected = loaded && connection?.status === "connected";

  return (
    <div className="flex flex-col gap-3">
      {banner ? (
        <p
          role={banner.kind === "error" ? "alert" : undefined}
          className={
            banner.kind === "error"
              ? "rounded-md bg-error-container px-3 py-2 text-sm text-on-error-container"
              : "rounded-md bg-primary-container px-3 py-2 text-sm text-on-primary-container"
          }
        >
          {banner.text}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {!isConnected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-on-surface-variant">{t("disconnectedHint")}</p>
          {canManageConnection ? (
            <form
              method="GET"
              action={`/api/companies/${companyId}/shopify/connect/start`}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                name="shop"
                required
                autoComplete="off"
                placeholder={t("shopPlaceholder")}
                aria-label={t("shopLabel")}
                className="min-w-[16rem] flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              />
              <Button type="submit">{t("connectButton")}</Button>
            </form>
          ) : (
            <p className="text-sm text-on-surface-variant">{t("adminOnlyHint")}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center rounded-full bg-primary-container px-2 py-0.5 text-xs font-medium text-on-primary-container">
              {t("statusConnected")}
            </span>
            <span className="text-on-surface">{connection?.shop_domain}</span>
          </div>
          {connection?.last_synced_at ? (
            <p className="text-sm text-on-surface-variant">
              {t("lastSynced", { when: new Date(connection.last_synced_at).toLocaleString() })}
            </p>
          ) : (
            <p className="text-sm text-on-surface-variant">{t("neverSynced")}</p>
          )}

          {syncResult ? (
            <div className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-low px-3 py-3">
              <p className="text-sm text-on-surface">
                {t("syncResult", {
                  synced: syncResult.synced,
                  deactivated: syncResult.deactivated,
                  skipped: syncResult.skipped.length,
                })}
              </p>
              {syncResult.truncated ? (
                <p className="text-sm text-on-surface-variant">{t("truncated", { max: syncResult.synced })}</p>
              ) : null}
              {syncResult.skipped.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant text-on-surface-variant">
                        <th className="py-2 pr-3 font-medium">{t("skippedProductHeader")}</th>
                        <th className="py-2 pr-3 font-medium">{t("skippedReasonHeader")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncResult.skipped.map((row, i) => (
                        <tr key={`${row.title}-${i}`} className="border-b border-outline-variant/50">
                          <td className="py-2 pr-3">{row.title}</td>
                          <td className="py-2 pr-3">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" isLoading={view === "syncing"} onClick={handleSync}>
              {view === "syncing" ? t("syncingButton") : t("syncButton")}
            </Button>

            {canManageConnection ? (
              view === "confirmingDisconnect" ? (
                <>
                  <Button type="button" variant="danger" size="sm" onClick={handleDisconnect}>
                    {t("confirmDisconnectButton")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setView("idle")}>
                    {t("cancelButton")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setView("confirmingDisconnect")}
                >
                  {t("disconnectButton")}
                </Button>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
