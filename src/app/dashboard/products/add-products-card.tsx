"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/landing/brand-logos";
import { ProductForm } from "./product-form";
import { ImportPanel } from "./import-panel";
import { ShopifyConnectCard } from "./shopify-connect-card";

// The three ways to add products -- one by one, spreadsheet, Shopify --
// collapsed from three separate <Card>s into one tabbed surface, mirroring
// the agent connections' ChannelTabsCard (my-agents/[agentSlug]/
// channel-tabs-card.tsx): all panels stay mounted (hidden via CSS, not
// conditional rendering) so each keeps its own state, roving tabindex +
// arrow keys follow the WAI-ARIA tabs pattern, and the active tab's accent
// tints the tab underline and a faint wash at the top of the card.
//
// Unlike ChannelTabsCard (text-only tabs), the Shopify tab carries the
// coloured Shopify brand mark alongside its label -- an explicit ask, and
// the only third-party surface here.

type TabKey = "csv" | "shopify" | "manual";
const TAB_KEYS: TabKey[] = ["csv", "shopify", "manual"];

const ACCENT: Record<TabKey, string> = {
  csv: "#3525cd",
  shopify: "#95BF47",
  manual: "#3525cd",
};

export function AddProductsCard({
  companyId,
  companyCurrency,
  canManageConnection,
  onCatalogChanged,
}: {
  companyId: string;
  companyCurrency: string | null;
  canManageConnection: boolean;
  onCatalogChanged: () => void;
}) {
  const t = useTranslations("Products");
  const [activeTab, setActiveTab] = useState<TabKey>("csv");
  // Remounts ProductForm to clear it when the user cancels.
  const [formKey, setFormKey] = useState(0);
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const focusTab = useCallback((key: TabKey) => {
    setActiveTab(key);
    tabRefs.current[key]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const i = TAB_KEYS.indexOf(activeTab);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        focusTab(TAB_KEYS[(i + dir + TAB_KEYS.length) % TAB_KEYS.length]);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusTab(TAB_KEYS[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        focusTab(TAB_KEYS[TAB_KEYS.length - 1]);
      }
    },
    [activeTab, focusTab],
  );

  const accent = ACCENT[activeTab];

  return (
    <Card
      className="relative isolate overflow-hidden"
      style={{ backgroundImage: `linear-gradient(180deg, ${accent}0f, transparent 200px)` }}
    >
      <CardHeader>
        <CardTitle>{t("addTabs.cardTitle")}</CardTitle>
      </CardHeader>

      <div
        role="tablist"
        aria-label={t("addTabs.tablistLabel")}
        onKeyDown={onKeyDown}
        className="-mx-6 mb-6 flex gap-1 overflow-x-auto border-b border-outline-variant px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TAB_KEYS.map((key) => {
          const selected = activeTab === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              id={`add-products-tab-${key}`}
              aria-controls={`add-products-tabpanel-${key}`}
              onClick={() => setActiveTab(key)}
              style={selected ? { borderColor: accent, color: key === "shopify" ? undefined : accent } : undefined}
              className={clsx(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                selected
                  ? "font-semibold"
                  : "border-transparent font-medium text-on-surface-variant hover:border-outline-variant hover:text-on-surface",
              )}
            >
              {key === "shopify" ? <BrandLogo name="Shopify" className="h-4 w-4 shrink-0" /> : null}
              {t(`addTabs.${key}`)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="add-products-tabpanel-manual"
        aria-labelledby="add-products-tab-manual"
        hidden={activeTab !== "manual"}
      >
        <ProductForm
          key={formKey}
          companyId={companyId}
          mode="create"
          companyCurrency={companyCurrency}
          onSaved={onCatalogChanged}
          onCancel={() => setFormKey((k) => k + 1)}
        />
      </div>

      <div
        role="tabpanel"
        id="add-products-tabpanel-csv"
        aria-labelledby="add-products-tab-csv"
        hidden={activeTab !== "csv"}
      >
        <ImportPanel companyId={companyId} canEdit onImported={onCatalogChanged} />
      </div>

      <div
        role="tabpanel"
        id="add-products-tabpanel-shopify"
        aria-labelledby="add-products-tab-shopify"
        hidden={activeTab !== "shopify"}
      >
        <ShopifyConnectCard
          companyId={companyId}
          canManageConnection={canManageConnection}
          onSynced={onCatalogChanged}
        />
      </div>
    </Card>
  );
}
