"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "./brand-logos";
import {
  BadgeCheckIcon,
  UsersIcon,
  PackageIcon,
  CalendarIcon,
  ChatIcon,
  BarChartIcon,
  SettingsIcon,
} from "@/components/ui/icons";
import { TeamAgentCard, type TeamAgent } from "../../app/dashboard/agent-card";

export type DemoAgent = { slug: "malu" | "ana"; name: string; role: string; desc: string };

const STEP_DURATION_MS = 5000;
const PHOTO: Record<"malu" | "ana", string> = {
  malu: "/agents/sales-1.png",
  ana: "/agents/secretary-1.png",
};

type MaluTab = "availability" | "shipping" | "returns" | "handoff";
type AnaTab = "availability" | "handoff";
type SchedulingTab = "appointments" | "services" | "settings";

type Screen =
  | { kind: "team" }
  | { kind: "settings"; tab: MaluTab | AnaTab }
  | { kind: "products" }
  | { kind: "scheduling"; tab: SchedulingTab }
  | { kind: "live" };

function screensFor(slug: "malu" | "ana"): Screen[] {
  if (slug === "malu") {
    return [
      { kind: "team" },
      { kind: "settings", tab: "availability" },
      { kind: "settings", tab: "shipping" },
      { kind: "settings", tab: "returns" },
      { kind: "settings", tab: "handoff" },
      { kind: "products" },
      { kind: "live" },
    ];
  }
  return [
    { kind: "team" },
    { kind: "settings", tab: "availability" },
    { kind: "settings", tab: "handoff" },
    { kind: "scheduling", tab: "appointments" },
    { kind: "scheduling", tab: "services" },
    { kind: "scheduling", tab: "settings" },
    { kind: "live" },
  ];
}

// The "click here" cue itself: a small solid dot with an expanding,
// fading ring behind it (Tailwind's ping recipe) — the same visual language
// as a notification/live badge, animated enough to actually catch the eye
// instead of the barely-there opacity pulse this replaced.
function PingBadge({ size = "h-4 w-4" }: { size?: string }) {
  return (
    <span aria-hidden className={`absolute -right-1.5 -top-1.5 flex ${size}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
      <span className={`relative inline-flex ${size} rounded-full bg-primary ring-2 ring-white`} />
    </span>
  );
}

// Live-imported dashboard chrome around a step: the real markup is rendered
// inert (aria-hidden + pointer-events-none — it's wired for the real app's
// routes/auth, not this tour) and one accessible, pulsing button sits on top
// as the actual hotspot. Same static-screenshot-plus-hotspot pattern a
// recorded product tour uses, minus the screenshot: the "screenshot" is real
// component/markup, so it can't drift from what the dashboard looks like.
function Hotspot({ label, onClick, className = "", children }: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      <div aria-hidden className="pointer-events-none rounded-lg ring-1 ring-primary/40">
        {children}
      </div>
      <button type="button" onClick={onClick} aria-label={label} className="absolute inset-0 cursor-pointer rounded-lg">
        <PingBadge />
      </button>
    </div>
  );
}

type NavKey = "myAgents" | "products" | "scheduling" | "conversations" | "metrics" | "settings";

// A presentational stand-in for the real <Sidebar> (sidebar.tsx): that one
// reads the live route via usePathname() for its active state and wires a
// real logout form action, neither of which makes sense pinned inside a
// step of this tour. Same icons, same nav copy (Dashboard.tabs.*), same
// classes — just driven by the tour's own step instead of the URL, and only
// the one nav item this step wants "clicked" is an actual button.
function DemoSidebar({
  active,
  hotspot,
  companyLabel,
}: {
  active: NavKey;
  hotspot?: { key: NavKey; label: string; onClick: () => void };
  companyLabel: string;
}) {
  const t = useTranslations("Dashboard");
  const items: { key: NavKey; icon: typeof UsersIcon }[] = [
    { key: "myAgents", icon: UsersIcon },
    { key: "conversations", icon: ChatIcon },
    { key: "products", icon: PackageIcon },
    { key: "scheduling", icon: CalendarIcon },
    { key: "metrics", icon: BarChartIcon },
    { key: "settings", icon: SettingsIcon },
  ];

  return (
    <div className="flex w-40 shrink-0 flex-col border-r border-outline-variant bg-surface sm:w-48">
      <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-3">
        <Image src="/logo-icon.png" alt="" width={22} height={22} className="shrink-0 rounded-md" />
        <span className="truncate text-sm font-bold tracking-tight text-primary">Staffra</span>
      </div>
      <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-[11px] font-semibold text-primary">
          {companyLabel.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-xs font-semibold text-on-surface">{companyLabel}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          const row = (
            <div
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                isActive
                  ? "bg-secondary-container font-bold text-on-secondary-container"
                  : "font-medium text-on-surface-variant"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t(`tabs.${item.key}`)}</span>
            </div>
          );
          if (hotspot && hotspot.key === item.key) {
            return (
              <Hotspot key={item.key} label={hotspot.label} onClick={hotspot.onClick}>
                {row}
              </Hotspot>
            );
          }
          return <div key={item.key}>{row}</div>;
        })}
      </nav>
    </div>
  );
}

function TopBar({ sectionKey }: { sectionKey: NavKey }) {
  const t = useTranslations("Dashboard.tabs");
  return (
    <div className="flex h-9 shrink-0 items-center border-b border-outline-variant bg-surface/80 px-4">
      <span className="text-sm font-extrabold tracking-tight text-primary">{t(sectionKey)}</span>
    </div>
  );
}

function PageHeaderMock({ icon: Icon, title, subtitle }: { icon: typeof UsersIcon; title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h1 className="text-sm font-semibold tracking-tight text-on-surface">{title}</h1>
        <p className="text-xs text-on-surface-variant">{subtitle}</p>
      </div>
    </div>
  );
}

// A framing callout for a screen with several ways to do the same thing
// (e.g. three tabs to add a product) — a solid accent panel with a short
// bulleted overview, the same "orient before you click" move a recorded
// product tour's own narration bubble makes at a busy step.
function Callout({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-3 rounded-xl bg-primary p-3 text-on-primary shadow-level2">
      <p className="text-xs font-semibold">{title}</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-xs leading-snug text-on-primary/90">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span aria-hidden>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A small underlined tab strip, reused for the settings tabs and the
// scheduling area's own sub-nav — every tab is a real, clickable jump to
// that step (not just the current one), same as clicking a tab in the real
// app switches panels instantly.
function TabStrip({
  tabs,
  active,
  next,
  onSelect,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  next?: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="mb-2 flex gap-3 border-b border-outline-variant text-[11px] font-semibold">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`relative ${
            tab.key === active
              ? "border-b-2 border-primary pb-1.5 text-primary"
              : tab.key === next
                ? "rounded-md px-1.5 pb-1.5 pt-0.5 text-on-surface-variant ring-1 ring-primary/40"
                : "pb-1.5 text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {tab.label}
          {tab.key === next ? <PingBadge size="h-2.5 w-2.5" /> : null}
        </button>
      ))}
    </div>
  );
}

function TeamStep({ agents, t, onPick }: { agents: DemoAgent[]; t: ReturnType<typeof useTranslations>; onPick: (a: DemoAgent) => void }) {
  const tMyAgents = useTranslations("MyAgents");
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <PageHeaderMock icon={UsersIcon} title={tMyAgents("pageTitle")} subtitle={tMyAgents("pageSubtitle")} />
      <div className="mb-2 flex gap-3 border-b border-outline-variant text-[11px] font-semibold text-on-surface-variant">
        <span className="border-b-2 border-primary pb-1 text-primary">{tMyAgents("filterAll")}</span>
        <span className="pb-1">{tMyAgents("filterActive")}</span>
        <span className="pb-1">{tMyAgents("filterPaused")}</span>
        <span className="pb-1">{tMyAgents("filterAvailable")}</span>
      </div>
      <div className="flex flex-col gap-2">
        {agents.map((agent) => {
          const mockAgent: TeamAgent = {
            slug: agent.slug,
            name: agent.name,
            role: agent.role,
            description: agent.desc,
            photoSrc: PHOTO[agent.slug],
            status: "active",
          };
          return (
            <Hotspot key={agent.slug} label={t("openSettingsHotspot", { name: agent.name })} onClick={() => onPick(agent)}>
              <TeamAgentCard agent={mockAgent} billingActive style={{ animation: "none" }} />
            </Hotspot>
          );
        })}
      </div>
    </div>
  );
}

function SettingsStep({
  agent,
  tab,
  onTabSelect,
}: {
  agent: DemoAgent;
  tab: MaluTab | AnaTab;
  onTabSelect: (tab: MaluTab | AnaTab) => void;
}) {
  const tMyAgents = useTranslations("MyAgents");
  const tTeach = useTranslations("Teach");
  const tDemo = useTranslations("LandingV2.interactiveDemo.demo");

  const tabs =
    agent.slug === "malu"
      ? [
          { key: "availability", label: tMyAgents("availability.title") },
          { key: "shipping", label: tTeach("shipping.title") },
          { key: "returns", label: tTeach("returns.title") },
          { key: "handoff", label: tMyAgents("humanHandoff.title") },
        ]
      : [
          { key: "availability", label: tMyAgents("availability.title") },
          { key: "handoff", label: tMyAgents("humanHandoff.title") },
        ];

  const tabIndex = tabs.findIndex((t) => t.key === tab);
  const nextTab = tabIndex >= 0 && tabIndex < tabs.length - 1 ? tabs[tabIndex + 1].key : undefined;

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-2.5">
        <AgentAvatar role="intent" size="md" photoSrc={PHOTO[agent.slug]} alt={agent.name} />
        <div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-on-surface">{agent.name}</span>
            <BadgeCheckIcon className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-xs font-medium text-primary">{agent.role}</p>
        </div>
      </div>
      <Card>
        <TabStrip tabs={tabs} active={tab} next={nextTab} onSelect={(key) => onTabSelect(key as MaluTab | AnaTab)} />
        <CardContent className="p-0">
          {tab === "availability" ? (
            <>
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-tertiary/10 px-2 py-0.5 text-[10px] font-semibold text-tertiary">
                {tMyAgents("availability.activeStatus")}
              </span>
              <p className="text-xs text-on-surface-variant">
                {tMyAgents("availability.description", { name: agent.name })}
              </p>
              <div>
                <Button type="button" variant="secondary" size="sm">
                  {tMyAgents("availability.pauseButton")}
                </Button>
              </div>
            </>
          ) : tab === "shipping" ? (
            <>
              <p className="text-xs text-on-surface-variant">{tTeach("shipping.description")}</p>
              <label className="text-[11px] font-semibold text-on-surface">{tTeach("shipping.label")}</label>
              <div className="rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 text-xs text-on-surface">
                {tDemo("shippingText")}
              </div>
            </>
          ) : tab === "returns" ? (
            <>
              <p className="text-xs text-on-surface-variant">{tTeach("returns.description")}</p>
              <label className="text-[11px] font-semibold text-on-surface">{tTeach("returns.label")}</label>
              <div className="rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 text-xs text-on-surface">
                {tDemo("returnsText")}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-on-surface-variant">
                {tMyAgents("humanHandoff.description", { name: agent.name })}
              </p>
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-7 items-center rounded-full bg-primary p-0.5">
                  <span className="h-3 w-3 translate-x-3 rounded-full bg-white transition-transform" />
                </span>
                <span className="text-xs font-medium text-on-surface">{tMyAgents("humanHandoff.toggleLabel")}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductsStep() {
  const tProducts = useTranslations("Products");
  const t = useTranslations("LandingV2.interactiveDemo.malu");
  const [addTab, setAddTab] = useState<"csv" | "shopify" | "manual">("csv");

  const rows = [
    { name: t("product1Name"), price: t("product1Price"), stock: t("product1Stock"), category: t("product1Category") },
    { name: t("product2Name"), price: t("product2Price"), stock: t("product2Stock"), category: t("product2Category") },
  ];
  const addTabs = [
    { key: "csv", label: tProducts("addTabs.csv") },
    { key: "shopify", label: tProducts("addTabs.shopify") },
    { key: "manual", label: tProducts("addTabs.manual") },
  ];
  const moreFields = [
    tProducts("form.descriptionLabel"),
    tProducts("form.categoryLabel"),
    tProducts("form.stockLabel"),
    tProducts("form.skuLabel"),
    tProducts("form.imageUrlLabel"),
    tProducts("form.productUrlLabel"),
    tProducts("form.currencyLabel"),
  ];

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <PageHeaderMock icon={PackageIcon} title={tProducts("pageTitle")} subtitle={tProducts("pageSubtitle")} />

      <Callout
        title={t("productsIntro")}
        items={[
          `${tProducts("addTabs.manual")}: ${t("introManual")} ${t("moreFieldsShort", { count: moreFields.length })}`,
          `${tProducts("addTabs.shopify")}: ${t("introShopify")}`,
          `${tProducts("addTabs.csv")}: ${t("introCsv")}`,
        ]}
      />

      {/* Real screen, card 1: the tabbed "Add products" card — one by one,
          Shopify, or a spreadsheet import. Ringed to match the callout
          above pointing at it — the highlighted-target-plus-explanation
          pairing a recorded tour's own narration step makes. */}
      <Card className="mb-4 ring-2 ring-primary ring-offset-2 ring-offset-surface">
        <CardHeader>
          <CardTitle>{tProducts("addTabs.cardTitle")}</CardTitle>
        </CardHeader>
        <TabStrip tabs={addTabs} active={addTab} onSelect={(key) => setAddTab(key as typeof addTab)} />
        {addTab === "csv" ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-on-surface-variant">{tProducts("import.description")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm">
                {tProducts("import.downloadTemplateButton")}
              </Button>
              <Button type="button" variant="secondary" size="sm">
                {tProducts("import.chooseFileButton")}
              </Button>
            </div>
          </div>
        ) : addTab === "shopify" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <BrandLogo name="Shopify" className="h-4 w-4 shrink-0" />
              <p className="text-xs font-semibold text-on-surface">{tProducts("shopify.title")}</p>
            </div>
            <p className="text-xs text-on-surface-variant">{tProducts("shopify.description")}</p>
            <Input label={tProducts("shopify.shopLabel")} placeholder={tProducts("shopify.shopPlaceholder")} readOnly />
            <div>
              <Button type="button" size="sm">
                {tProducts("shopify.connectButton")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Input label={tProducts("form.nameLabel")} readOnly />
              <Input label={tProducts("form.priceLabel")} readOnly />
            </div>
            <p className="text-[11px] text-on-surface-variant">
              {t("moreFieldsHint", {
                count: moreFields.length,
                fields: moreFields.join(", "),
              })}
            </p>
            <div>
              <Button type="button" size="sm">
                {tProducts("form.addButton")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Real screen, card 2: the catalog itself — filters, list, pagination. */}
      <Card>
        <CardHeader>
          <CardTitle>{tProducts("pageTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <Input label={tProducts("filters.searchLabel")} placeholder={tProducts("filters.searchPlaceholder")} readOnly />
            <Button type="button" variant="secondary" size="sm">
              {tProducts("filters.searchButton")}
            </Button>
            <label className="flex items-center gap-1.5 text-sm text-on-surface-variant">
              <input type="checkbox" readOnly className="h-4 w-4 rounded border-outline-variant" />
              {tProducts("filters.includeInactiveLabel")}
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-outline-variant">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-on-surface-variant">
                  <th className="px-3 py-1.5 font-semibold">{tProducts("list.nameColumn")}</th>
                  <th className="px-3 py-1.5 font-semibold">{tProducts("list.priceColumn")}</th>
                  <th className="px-3 py-1.5 font-semibold">{tProducts("list.stockColumn")}</th>
                  <th className="px-3 py-1.5 font-semibold">{tProducts("list.categoryColumn")}</th>
                  <th className="px-3 py-1.5 font-semibold">{tProducts("list.statusColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-t border-outline-variant first:border-t-0">
                    <td className="px-3 py-2 font-medium text-on-surface">{row.name}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{row.price}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{row.stock}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{row.category}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-[10px] font-semibold text-tertiary">
                        {tProducts("list.activeLabel")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="secondary" size="sm" disabled>
              {tProducts("filters.previousPage")}
            </Button>
            <span className="text-xs text-on-surface-variant">{tProducts("filters.pageOf", { page: 1, totalPages: 1 })}</span>
            <Button type="button" variant="secondary" size="sm" disabled>
              {tProducts("filters.nextPage")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SchedulingStep({
  agent,
  tab,
  onTabSelect,
}: {
  agent: DemoAgent;
  tab: SchedulingTab;
  onTabSelect: (tab: SchedulingTab) => void;
}) {
  const tTabs = useTranslations("Scheduling.tabs");
  const tAppointments = useTranslations("Scheduling.appointments");
  const tServices = useTranslations("Services");
  const tSettings = useTranslations("Scheduling.settings");
  const tDemo = useTranslations("LandingV2.interactiveDemo.demo");
  const tAna = useTranslations("LandingV2.interactiveDemo.ana");

  const tabs: { key: SchedulingTab; label: string }[] = [
    { key: "appointments", label: tTabs("appointments") },
    { key: "services", label: tTabs("services") },
    { key: "settings", label: tTabs("settings") },
  ];
  const tabIndex = tabs.findIndex((t) => t.key === tab);
  const nextTab = tabIndex >= 0 && tabIndex < tabs.length - 1 ? tabs[tabIndex + 1].key : undefined;

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <TabStrip tabs={tabs} active={tab} next={nextTab} onSelect={(key) => onTabSelect(key as SchedulingTab)} />
      {tab === "appointments" ? (
        <>
          <PageHeaderMock icon={CalendarIcon} title={tAppointments("pageTitle")} subtitle={tAppointments("pageSubtitle")} />
          <div className="flex items-center justify-between rounded-lg border border-outline-variant px-3 py-2 text-xs">
            <div>
              <p className="font-medium text-on-surface">{tDemo("appointmentClient")}</p>
              <p className="text-on-surface-variant">{tDemo("appointmentService")}</p>
            </div>
            <span className="font-semibold text-primary">{tDemo("appointmentTime")}</span>
          </div>
        </>
      ) : tab === "services" ? (
        <>
          <PageHeaderMock icon={CalendarIcon} title={tServices("pageTitle")} subtitle={tServices("pageSubtitle")} />
          <div className="overflow-hidden rounded-lg border border-outline-variant">
            <div className="flex bg-surface-container-low px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant">
              <span className="flex-1">{tServices("form.nameLabel")}</span>
              <span>{tServices("form.durationLabel")}</span>
            </div>
            <div className="flex items-center border-t border-outline-variant px-3 py-2 text-xs">
              <span className="flex-1 font-medium text-on-surface">{tDemo("serviceName")}</span>
              <span className="text-on-surface-variant">{tDemo("serviceDuration")}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <PageHeaderMock icon={CalendarIcon} title={tSettings("pageTitle")} subtitle={tSettings("pageSubtitle")} />
          <Card className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-on-surface">{tSettings("businessHours.title")}</p>
            {[
              { day: tAna("day1"), hours: tAna("day1Hours") },
              { day: tAna("day2"), hours: tAna("day2Hours") },
            ].map((row) => (
              <div key={row.day} className="flex items-center justify-between border-t border-outline-variant pt-1.5 text-xs first:border-t-0 first:pt-0">
                <span className="font-medium text-on-surface">{row.day}</span>
                <span className="text-on-surface-variant">{row.hours}</span>
              </div>
            ))}
          </Card>
        </>
      )}
      <span className="sr-only">{agent.name}</span>
    </div>
  );
}

function LiveStep({ agent, t, onRestart }: { agent: DemoAgent; t: ReturnType<typeof useTranslations>; onRestart: () => void }) {
  const customerMsg = t(agent.slug === "malu" ? "live.maluCustomerMsg" : "live.anaCustomerMsg");
  const agentMsg = t(agent.slug === "malu" ? "live.maluAgentMsg" : "live.anaAgentMsg");
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level1">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AgentAvatar role="intent" size="md" shape="circle" photoSrc={PHOTO[agent.slug]} alt={agent.name} />
            <span className="text-sm font-semibold text-on-surface">{agent.name}</span>
          </div>
          <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-xs font-semibold text-primary">
            {t("live.badge")}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="max-w-[85%] self-end rounded-xl rounded-tr-none bg-primary p-2.5 text-on-primary">
            {customerMsg}
          </div>
          <div className="max-w-[85%] self-start rounded-xl rounded-tl-none bg-surface-container p-2.5 text-on-surface">
            {agentMsg}
          </div>
        </div>
        <button type="button" onClick={onRestart} className="mt-3 text-xs font-semibold text-primary hover:underline">
          {t("watchAgain")}
        </button>
      </div>
    </div>
  );
}

export function InteractiveDemo({ agents }: { agents: DemoAgent[] }) {
  const t = useTranslations("LandingV2.interactiveDemo");
  const tMyAgents = useTranslations("MyAgents");
  const tTeach = useTranslations("Teach");
  const tProducts = useTranslations("Products");
  const tSchedulingTabs = useTranslations("Scheduling.tabs");
  const tDashboardTabs = useTranslations("Dashboard.tabs");
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState<DemoAgent>(agents[0]);
  const [paused, setPaused] = useState(false);

  const screens = screensFor(branch.slug);
  const total = screens.length;
  const screen = screens[step] ?? screens[0];

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % total), STEP_DURATION_MS);
    return () => clearTimeout(id);
  }, [step, paused, total]);

  function restart() {
    setBranch(agents[0]);
    setStep(0);
  }

  function pick(agent: DemoAgent) {
    setBranch(agent);
    setStep(1);
  }

  function goToSettingsTab(tab: MaluTab | AnaTab) {
    const i = screens.findIndex((s) => s.kind === "settings" && s.tab === tab);
    if (i >= 0) setStep(i);
  }

  function goToSchedulingTab(tab: SchedulingTab) {
    const i = screens.findIndex((s) => s.kind === "scheduling" && s.tab === tab);
    if (i >= 0) setStep(i);
  }

  const title =
    screen.kind === "team"
      ? tMyAgents("pageTitle")
      : screen.kind === "settings"
        ? screen.tab === "availability"
          ? tMyAgents("availability.title")
          : screen.tab === "shipping"
            ? tTeach("shipping.title")
            : screen.tab === "returns"
              ? tTeach("returns.title")
              : tMyAgents("humanHandoff.title")
        : screen.kind === "products"
          ? tProducts("pageTitle")
          : screen.kind === "scheduling"
            ? tSchedulingTabs(screen.tab)
            : tDashboardTabs("conversations");
  const captionKey =
    screen.kind === "settings"
      ? screen.tab
      : screen.kind === "scheduling"
        ? screen.tab === "appointments"
          ? "schedulingAppointments"
          : screen.tab === "services"
            ? "schedulingServices"
            : "schedulingSettings"
        : screen.kind;
  const caption = t(`screens.${captionKey}`, { name: branch.name });

  const sidebarActive: NavKey =
    screen.kind === "products" ? "products" : screen.kind === "scheduling" ? "scheduling" : screen.kind === "live" ? "conversations" : "myAgents";

  const nextScreen = screens[step + 1];
  const isLastSettingsTab = screen.kind === "settings" && nextScreen?.kind !== "settings";
  const isLastSchedulingTab = screen.kind === "scheduling" && nextScreen?.kind !== "scheduling";

  const hotspot = isLastSettingsTab
    ? {
        key: (branch.slug === "malu" ? "products" : "scheduling") as NavKey,
        label: t(branch.slug === "malu" ? "nav.goToProducts" : "nav.goToScheduling"),
        onClick: () => setStep(step + 1),
      }
    : isLastSchedulingTab || screen.kind === "products"
      ? { key: "conversations" as NavKey, label: t("nav.goToConversations"), onClick: () => setStep(step + 1) }
      : undefined;

  return (
    <div
      className="relative mx-auto w-full max-w-4xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_20px_50px_rgba(79,70,229,0.1)]">
        <div className="flex items-center gap-1.5 bg-[#0f172a] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
        </div>

        <div className="flex h-[380px] sm:h-[420px]">
          <DemoSidebar active={sidebarActive} hotspot={hotspot} companyLabel={t("demoCompany")} />
          <div className="flex flex-1 flex-col overflow-hidden bg-surface">
            <TopBar sectionKey={sidebarActive} />
            {screen.kind === "team" ? (
              <TeamStep agents={agents} t={t} onPick={pick} />
            ) : screen.kind === "settings" ? (
              <SettingsStep agent={branch} tab={screen.tab} onTabSelect={goToSettingsTab} />
            ) : screen.kind === "products" ? (
              <ProductsStep />
            ) : screen.kind === "scheduling" ? (
              <SchedulingStep agent={branch} tab={screen.tab} onTabSelect={goToSchedulingTab} />
            ) : (
              <LiveStep agent={branch} t={t} onRestart={restart} />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#eae6f4] bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0 text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#3525cd]">
              {step + 1}. {title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-[#464555] sm:text-[14px]">{caption}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setStep((step - 1 + total) % total)}
              aria-label={t("back")}
              className="rounded-lg p-2 text-[#464555] transition-colors hover:bg-[#f5f2ff] hover:text-[#3525cd]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12H4m0 0 6-6m-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setStep((step + 1) % total)}
              aria-label={t("next")}
              className="rounded-lg p-2 text-[#464555] transition-colors hover:bg-[#f5f2ff] hover:text-[#3525cd]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12h16m0 0-6-6m6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
