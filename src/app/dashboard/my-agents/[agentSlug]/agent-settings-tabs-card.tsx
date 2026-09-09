"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { AvailabilityCard } from "./availability-card";
import { HumanHandoffCard } from "./human-handoff-card";
import { PolicySection } from "../../settings/policy-section";

type TabKey = "availability" | "shipping" | "returns" | "humanHandoff";

const ACCENT = "#3525cd";

// Follow-up to D6's ChannelTabsCard -- the same "one card, several tabs"
// treatment for the hire's own behavior controls (pause/resume, human
// handoff) and, for Malu only, her sales policies (shipping/returns),
// replacing four separate full-width cards. Same rules as ChannelTabsCard:
// every panel stays mounted at all times (hidden via CSS, not conditional
// rendering) so each panel's own state/effects don't reset on a tab switch;
// each panel's own outer <Card> was stripped since this card is the only
// visual boundary now. Unlike channel brands, none of these four has a
// color of its own, so every tab shares one accent instead of a per-tab one.
export function AgentSettingsTabsCard({
  companyId,
  agentSlug,
  agentName,
  initialActive,
  allowHumanHandoff,
  shippingPolicy,
  returnPolicy,
  canEdit,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  initialActive: boolean;
  allowHumanHandoff: boolean;
  shippingPolicy: string | null;
  returnPolicy: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("MyAgents");
  // Reuses PolicySection's own titles ("Envio"/"Devoluções") rather than
  // duplicating them under a new key -- the tab label and the panel's own
  // heading (stripped below via `bare`) would otherwise drift apart.
  const tTeach = useTranslations("Teach");
  // Shipping/returns are Malu-only -- her own sales conversations are the
  // only place this content is ever relevant (see page.tsx's own note).
  const tabKeys = useMemo<TabKey[]>(
    () =>
      agentSlug === "malu"
        ? ["availability", "shipping", "returns", "humanHandoff"]
        : ["availability", "humanHandoff"],
    [agentSlug],
  );
  const [activeTab, setActiveTab] = useState<TabKey>("availability");
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const focusTab = useCallback((key: TabKey) => {
    setActiveTab(key);
    tabRefs.current[key]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const i = tabKeys.indexOf(activeTab);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        focusTab(tabKeys[(i + dir + tabKeys.length) % tabKeys.length]);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusTab(tabKeys[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        focusTab(tabKeys[tabKeys.length - 1]);
      }
    },
    [activeTab, tabKeys, focusTab],
  );

  const tabLabel: Record<TabKey, string> = {
    availability: t("availability.title"),
    shipping: tTeach("shipping.title"),
    returns: tTeach("returns.title"),
    humanHandoff: t("humanHandoff.title"),
  };

  return (
    <Card
      className="relative isolate overflow-hidden"
      style={{ backgroundImage: `linear-gradient(180deg, ${ACCENT}0f, transparent 200px)` }}
    >
      <div
        role="tablist"
        aria-label={t("settingsTabs.tablistLabel")}
        onKeyDown={onKeyDown}
        className="-mx-6 mb-6 flex gap-1 overflow-x-auto border-b border-outline-variant px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabKeys.map((key) => {
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
              id={`agent-settings-tab-${key}`}
              aria-controls={`agent-settings-tabpanel-${key}`}
              onClick={() => setActiveTab(key)}
              style={selected ? { borderColor: ACCENT, color: ACCENT } : undefined}
              className={clsx(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                selected
                  ? "font-semibold"
                  : "border-transparent font-medium text-on-surface-variant hover:border-outline-variant hover:text-on-surface",
              )}
            >
              {tabLabel[key]}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="agent-settings-tabpanel-availability"
        aria-labelledby="agent-settings-tab-availability"
        hidden={activeTab !== "availability"}
      >
        <AvailabilityCard
          companyId={companyId}
          agentSlug={agentSlug}
          agentName={agentName}
          initialActive={initialActive}
          canEdit={canEdit}
        />
      </div>

      {agentSlug === "malu" ? (
        <>
          <div
            role="tabpanel"
            id="agent-settings-tabpanel-shipping"
            aria-labelledby="agent-settings-tab-shipping"
            hidden={activeTab !== "shipping"}
          >
            <PolicySection
              bare
              companyId={companyId}
              fieldName="shipping_policy"
              sectionKey="shipping"
              initialValue={shippingPolicy}
              canEdit={canEdit}
            />
          </div>

          <div
            role="tabpanel"
            id="agent-settings-tabpanel-returns"
            aria-labelledby="agent-settings-tab-returns"
            hidden={activeTab !== "returns"}
          >
            <PolicySection
              bare
              companyId={companyId}
              fieldName="return_policy"
              sectionKey="returns"
              initialValue={returnPolicy}
              canEdit={canEdit}
            />
          </div>
        </>
      ) : null}

      <div
        role="tabpanel"
        id="agent-settings-tabpanel-humanHandoff"
        aria-labelledby="agent-settings-tab-humanHandoff"
        hidden={activeTab !== "humanHandoff"}
      >
        <HumanHandoffCard
          companyId={companyId}
          agentName={agentName}
          canEdit={canEdit}
          initialAllowHumanHandoff={allowHumanHandoff}
        />
      </div>
    </Card>
  );
}
