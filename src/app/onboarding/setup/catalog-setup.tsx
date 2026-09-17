"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { PackageIcon, PlusIcon, UploadIcon } from "@/components/ui/icons";
import { NarratedFeed, type FeedLine } from "./narrated-feed";
import { OnboardingLoader } from "../onboarding-loader";

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const POLL_INTERVAL_MS = 1200;
const PAYOFF_DWELL_MS = 1400;

type Source = "shopify" | "spreadsheet" | "manual";
// Shape as the status route actually returns it -- camelCase, not the column
// names. Reading `inserted_count` here silently rendered "0 products ready".
type Job = { status: string; totalRows: number | null; insertedCount: number | null };

export function CatalogSetup({ companyId, agentName }: { companyId: string; agentName: string }) {
  const t = useTranslations("Onboarding.setup.catalog");
  const router = useRouter();

  const [source, setSource] = useState<Source>("shopify");
  const [shop, setShop] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function push(line: FeedLine) {
    setLines((prev) => [...prev.filter((l) => l.id !== line.id), line]);
  }

  function settle(id: string, detail?: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, state: "done", detail: detail ?? l.detail } : l)));
  }

  async function pollJob(): Promise<Job | null> {
    const res = await fetch(`/api/companies/${companyId}/products/import/status`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.job ?? null) as Job | null;
  }

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t("errorTooBig"));
      return;
    }

    setIsWorking(true);
    setLines([]);
    push({ id: "open", text: t("feedOpening", { file: file.name }), state: "running" });

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/companies/${companyId}/products/import`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      setIsWorking(false);
      setError(t("errorImport"));
      return;
    }

    const { queued, skippedCount } = (await res.json()) as { queued: number; skippedCount: number };
    settle("open");
    push({ id: "rows", text: t("feedRows", { count: queued + skippedCount }), state: "done" });
    if (skippedCount > 0) {
      push({ id: "skipped", text: t("feedSkipped", { count: skippedCount }), state: "done" });
    }
    push({ id: "saving", text: t("feedSaving"), state: "running" });

    // The insert runs after the response (the route's own after() hook), so
    // the real product count only exists once the job row says so.
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const job = await pollJob();
      if (!job) continue;
      if (job.status === "succeeded") {
        settle("saving", undefined);
        setLines((prev) =>
          prev
            .filter((l) => l.id !== "saving")
            .concat([
              { id: "products", text: t("feedProducts", { count: job.insertedCount ?? 0 }), state: "done" },
              { id: "ready", text: t("feedReady", { name: agentName }), state: "done" },
            ]),
        );
        setIsWorking(false);
        // The payoff line is the point of narrating any of this. Navigating in
        // the same tick meant "37 products ready" never got a frame on screen.
        await new Promise((resolve) => setTimeout(resolve, PAYOFF_DWELL_MS));
        router.push("/onboarding/ready");
        return;
      }
      if (job.status === "failed") {
        setIsWorking(false);
        setError(t("errorImport"));
        return;
      }
    }

    setIsWorking(false);
    setError(t("errorSlow"));
  }

  // The step has no skip any more: the proof chat's whole point is her
  // answering from real data, so this is the fastest way to a working demo
  // for a merchant with no Shopify store and no spreadsheet ready yet. Price
  // is required (not optional, unlike a service's) for the same reason --
  // the proof chat's own first suggestion is a price question, and a
  // product with nothing to answer would prove the opposite of the point.
  async function handleManualAdd() {
    const name = manualName.trim();
    if (!name || !manualPrice.trim() || isWorking) return;

    setError(null);
    setIsWorking(true);
    setLines([{ id: "saving", text: t("feedSaving"), state: "running" }]);

    const res = await fetch(`/api/companies/${companyId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Same BRL assumption as the services step: onboarding never asks the
      // currency, and every company created here starts without one.
      body: JSON.stringify({ name, price: Number(manualPrice), currency: "BRL" }),
    });

    if (!res.ok) {
      setIsWorking(false);
      setLines([]);
      setError(t("errorManual"));
      return;
    }

    setLines((prev) =>
      prev.map((l) => (l.id === "saving" ? { ...l, state: "done", text: t("feedProducts", { count: 1 }) } : l)),
    );
    setLines((prev) => [...prev, { id: "ready", text: t("feedReady", { name: agentName }), state: "done" }]);
    setIsWorking(false);

    await new Promise((resolve) => setTimeout(resolve, PAYOFF_DWELL_MS));
    router.push("/onboarding/ready");
  }

  function reset() {
    setLines([]);
    setError(null);
    setIsWorking(false);
  }

  if (lines.length > 0) {
    return (
      <div className="flex flex-col gap-7">
        <NarratedFeed lines={lines} />
        {error ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
            <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={reset}>
              {t("retry")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t("groupLabel")}</legend>
        <SourceOption
          id="catalog-source-shopify"
          name="catalog-source"
          active={source === "shopify"}
          onSelect={() => setSource("shopify")}
          icon={<PackageIcon className="h-5 w-5" />}
          title={t("shopifyTitle")}
          hint={t("shopifyHint")}
        >
          <form
            action={`/api/companies/${companyId}/shopify/connect/start`}
            method="get"
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <input type="hidden" name="returnTo" value="/onboarding/ready" />
            <input
              name="shop"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder={t("shopifyPlaceholder")}
              aria-label={t("shopifyPlaceholder")}
              className="h-11 flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface transition-all duration-200 placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
            />
            <Button type="submit" size="sm" disabled={!shop.trim()} className="h-11 shrink-0">
              {t("shopifyCta")}
            </Button>
          </form>
        </SourceOption>

        <SourceOption
          id="catalog-source-spreadsheet"
          name="catalog-source"
          active={source === "spreadsheet"}
          onSelect={() => setSource("spreadsheet")}
          icon={<UploadIcon className="h-5 w-5" />}
          title={t("fileTitle")}
          hint={t("fileHint")}
        >
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              isLoading={isWorking}
              loadingIndicator={<OnboardingLoader />}
              onClick={() => fileInput.current?.click()}
            >
              {t("fileCta")}
            </Button>
            <a
              href={`/api/companies/${companyId}/products/import-template`}
              className="text-label-md font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("fileTemplate")}
            </a>
          </div>
        </SourceOption>

        <SourceOption
          id="catalog-source-manual"
          name="catalog-source"
          active={source === "manual"}
          onSelect={() => setSource("manual")}
          icon={<PlusIcon className="h-5 w-5" />}
          title={t("manualTitle")}
          hint={t("manualHint")}
        >
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder={t("manualNamePlaceholder")}
              aria-label={t("manualNameLabel")}
              className="h-11 min-w-0 flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface transition-all duration-200 placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
            />
            <div className="relative shrink-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-sm text-on-surface-variant">
                {t("manualPricePrefix")}
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder={t("manualPricePlaceholder")}
                aria-label={t("manualPriceLabel")}
                className="h-11 w-[120px] rounded-md border border-outline-variant bg-surface-container-lowest pl-9 pr-3 text-body-md tabular-nums text-on-surface transition-all duration-200 placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
              />
            </div>
            <Button
              type="button"
              size="sm"
              isLoading={isWorking}
              loadingIndicator={<OnboardingLoader />}
              disabled={!manualName.trim() || !manualPrice.trim()}
              onClick={handleManualAdd}
              className="h-11 shrink-0"
            >
              {t("manualCta")}
            </Button>
          </div>
        </SourceOption>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// A real <input type="radio"> inside a <label>, with the expanded panel as a
// sibling rather than a descendant. The earlier version put role="radio" on a
// div wrapping the whole panel, which made its controls' semantics unreliable
// and -- because the wrapper swallowed the space key -- made it impossible to
// type a space into the shop field.
function SourceOption({
  id,
  name,
  active,
  onSelect,
  icon,
  title,
  hint,
  children,
}: {
  id: string;
  name: string;
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border p-5 transition-all duration-200",
        active
          ? "border-primary bg-primary-fixed/40"
          : "border-primary-fixed bg-white/70 hover:border-primary/40 hover:bg-white",
      )}
    >
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          type="radio"
          name={name}
          checked={active}
          onChange={onSelect}
          className="sr-only peer"
        />
        <span
          aria-hidden
          className={clsx(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary/30",
            active ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant",
          )}
        >
          {icon}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-body-lg font-semibold tracking-tight text-on-surface">{title}</span>
          <span className="text-sm text-on-surface-variant">{hint}</span>
        </span>
      </label>
      {active ? children : null}
    </div>
  );
}
