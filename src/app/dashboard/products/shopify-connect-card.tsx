"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/landing/brand-logos";

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
  mode: "full" | "delta";
  status: "completed" | "running";
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
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [banner] = useState<{ kind: "success" | "error"; text: string } | null>(() => {
    const ok = searchParams.get("shopify");
    const err = searchParams.get("shopify_error");
    if (ok === "connected") return { kind: "success", text: t("banner.connected") };
    if (err) return { kind: "error", text: t(`banner.${ERROR_KEYS.has(err) ? err : "connect_failed"}`) };
    return null;
  });

  useEffect(() => {
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

  async function handleSync(full = false) {
    setError(null);
    setSyncResult(null);
    setRunning(false);
    setView("syncing");
    const res = await fetch(`/api/companies/${companyId}/shopify/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ full }),
    });
    const json = (await res.json().catch(() => null)) as (SyncResult & { error?: string }) | null;
    setView("idle");

    if (res.status === 202 && json?.status === "running") {
      setRunning(true);
      return;
    }
    if (res.ok && json) {
      setSyncResult(json);
      onSynced();
      fetch(`/api/companies/${companyId}/shopify`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setConnection(j.connection ?? null));
      return;
    }
    if (json?.error === "reauth_required") {
      setError(t("reauthError"));
      setConnection(null);
      return;
    }
    setError(t("syncError"));
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
    <div className="flex flex-col gap-5">
      {banner ? (
        <p
          role={banner.kind === "error" ? "alert" : "status"}
          className={clsx(
            "rounded-2xl px-4 py-3 text-sm font-medium",
            banner.kind === "error" ? "bg-error-container/60 text-error" : "bg-success-100 text-success-500",
          )}
        >
          {banner.text}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="h-28 animate-pulse rounded-2xl bg-surface-container-low" />
      ) : !isConnected ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4 rounded-2xl bg-surface-container-low p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/50">
              <BrandLogo name="Shopify" className="h-6 w-6" />
            </span>
            <p className="text-sm leading-6 text-on-surface-variant">{t("disconnectedHint")}</p>
          </div>
          {canManageConnection ? (
            <form
              method="GET"
              action={`/api/companies/${companyId}/shopify/connect/start`}
              className="flex flex-col gap-2"
            >
              <label htmlFor="shopify-shop" className="text-[13px] font-semibold text-on-surface">
                {t("shopLabel")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="shopify-shop"
                  type="text"
                  name="shop"
                  required
                  autoComplete="off"
                  placeholder={t("shopPlaceholder")}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] placeholder:text-outline hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)]"
                />
                <Button type="submit" className="h-11">
                  {t("connectButton")}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-on-surface-variant">{t("adminOnlyHint")}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 rounded-2xl bg-surface-container-low p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/50">
              <BrandLogo name="Shopify" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-on-surface">{connection?.shop_domain}</p>
              <p className="text-[13px] text-on-surface-variant">
                {connection?.last_synced_at
                  ? t("lastSynced", { when: new Date(connection.last_synced_at).toLocaleString() })
                  : t("neverSynced")}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-100 px-2.5 py-1 text-[12px] font-semibold text-success-500">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success-500" />
              {t("statusConnected")}
            </span>
          </div>

          {running ? (
            <p role="status" className="rounded-2xl bg-primary-fixed/50 px-4 py-3 text-sm text-on-surface">
              {t("syncRunning")}
            </p>
          ) : null}

          {syncResult ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low px-4 py-3">
              <p role="status" className="text-sm font-semibold text-on-surface">
                {t(syncResult.mode === "delta" ? "syncResultDelta" : "syncResult", {
                  synced: syncResult.synced,
                  deactivated: syncResult.deactivated,
                  skipped: syncResult.skipped.length,
                })}
              </p>
              {syncResult.truncated ? (
                <p className="text-sm text-on-surface-variant">{t("truncated", { max: syncResult.synced })}</p>
              ) : null}
              {syncResult.skipped.length > 0 ? (
                <ul className="flex flex-col divide-y divide-outline-variant/40 text-sm">
                  {syncResult.skipped.map((row, i) => (
                    <li key={`${row.title}-${i}`} className="flex flex-col py-2 sm:flex-row sm:gap-4">
                      <span className="font-medium text-on-surface sm:w-1/2">{row.title}</span>
                      <span className="text-on-surface-variant">{row.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" isLoading={view === "syncing"} onClick={() => handleSync(false)}>
              {view === "syncing" ? t("syncingButton") : t("syncButton")}
            </Button>
            {canManageConnection ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={view === "syncing"}
                onClick={() => handleSync(true)}
              >
                {t("syncFullButton")}
              </Button>
            ) : null}
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
                <Button type="button" variant="ghost" size="sm" onClick={() => setView("confirmingDisconnect")}>
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
