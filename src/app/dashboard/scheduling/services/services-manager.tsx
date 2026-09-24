"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronRightIcon, PlusIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import { StatusBanner } from "@/components/ui/status-banner";
import { ServiceRow } from "./service-list";
import { ServiceForm } from "./service-form";
import { SideDrawer } from "@/components/ui/side-drawer";
import { FilterChips } from "@/components/ui/filter-chips";
import { DefaultServiceCard } from "./default-service-card";

export type Service = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price: string | number | null;
  currency: string | null;
  category: string | null;
  metadata: unknown;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  // 2026-09-24 -- who performs it; empty = every professional.
  professional_ids?: string[];
};

const FETCH_PAGE_SIZE = 100;
const MAX_FETCH_PAGES = 10;
const ALL = "__all__";
const UNCATEGORIZED = "__none__";

function categoryKey(service: Service): string {
  return service.category?.trim() || UNCATEGORIZED;
}

export function ServicesManager({
  companyId,
  companyCurrency,
  canEdit,
  initialServices,
  defaultService,
  professionals = [],
}: {
  companyId: string;
  companyCurrency: string | null;
  canEdit: boolean;
  initialServices: Service[];
  defaultService: Service | null;
  professionals?: { id: string; name: string }[];
}) {
  const t = useTranslations("Services");
  const router = useRouter();

  const [services, setServices] = useState<Service[]>(initialServices);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [showInactive, setShowInactive] = useState(false);
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);

  async function reload() {
    const collected: Service[] = [];
    for (let page = 1; page <= MAX_FETCH_PAGES; page++) {
      const params = new URLSearchParams({
        includeInactive: "true",
        page: String(page),
        pageSize: String(FETCH_PAGE_SIZE),
      });
      const res = await fetch(`/api/companies/${companyId}/services?${params.toString()}`).catch(() => null);
      if (!res?.ok) return;
      const json = await res.json();
      collected.push(...((json.services ?? []) as Service[]));
      if (collected.length >= (json.total ?? 0)) break;
    }
    setServices(collected);
    router.refresh();
  }

  function handleSaved() {
    setDrawer(null);
    reload();
  }

  function handlePatched(updated: Service) {
    setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  const active = services.filter((s) => s.is_active);
  const inactive = services.filter((s) => !s.is_active);
  const categories = [...new Set(active.map(categoryKey))].sort((a, b) =>
    a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b),
  );
  const labelFor = (key: string) =>
    key === ALL ? t("menu.all") : key === UNCATEGORIZED ? t("menu.uncategorized") : key;

  const needle = query.trim().toLowerCase();
  const matches = (s: Service) =>
    !needle || `${s.name} ${s.description ?? ""} ${s.category ?? ""}`.toLowerCase().includes(needle);
  const inFilter = (s: Service) => (category === ALL || categoryKey(s) === category) && matches(s);
  const visible = active.filter(inFilter);
  const visibleInactive = inactive.filter(inFilter);
  const isFiltering = needle !== "" || category !== ALL;
  const categoryNames = [
    ...new Set(services.map((s) => s.category?.trim()).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b));
  const groups = categories
    .map((key) => ({
      key,
      items: visible.filter((s) => categoryKey(s) === key).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);
  const editing = drawer?.mode === "edit" ? (services.find((s) => s.id === drawer.id) ?? null) : null;
  let rowIndex = 0;

  return (
    <div className="flex flex-col gap-6">
      {active.length === 0 ? (
        <StatusBanner tone="warn" title={t("emptyAlert.title")} body={t("emptyAlert.body")} />
      ) : null}
      <div
        className={clsx(
          "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
          active.length === 0 && "hidden",
        )}
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className={clsx("group relative sm:w-72", active.length === 0 && "hidden")}>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline transition-colors group-focus-within:text-primary" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("menu.search")}
              aria-label={t("menu.search")}
              className="h-10 w-full rounded-full border border-transparent bg-surface-container pl-10 pr-9 text-sm text-on-surface outline-none transition-[background-color,border-color,box-shadow] placeholder:text-outline focus:border-primary/40 focus:bg-surface-container-lowest focus:shadow-[0_0_0_4px_rgba(53,37,205,0.08)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                aria-label={t("menu.clearSearch")}
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-outline hover:bg-surface-container-high hover:text-on-surface"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {categories.length > 1 ? (
            <FilterChips keys={[ALL, ...categories]} value={category} onChange={setCategory} labelFor={labelFor} />
          ) : null}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setDrawer({ mode: "create" })}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] lg:self-auto"
          >
            <PlusIcon className="h-4 w-4" />
            {t("menu.add")}
          </button>
        ) : null}
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-5 rounded-[24px] border border-dashed border-outline-variant px-6 py-10 text-center">
          <p className="text-base font-semibold text-on-surface">{t("menu.emptyTitle")}</p>
          <div
            aria-hidden="true"
            className="flex w-full max-w-xl items-center gap-6 rounded-2xl bg-surface-container-lowest px-4 py-3.5 text-left opacity-60 ring-1 ring-outline-variant/60"
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-on-surface">
              {t("form.namePlaceholder")}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-on-surface">{t("menu.duration", { minutes: 30 })}</span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-on-surface">—</span>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setDrawer({ mode: "create" })}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <PlusIcon className="h-4 w-4" />
              {t("menu.add")}
            </button>
          ) : null}
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-[24px] bg-surface-container-low px-6 py-8 text-center text-sm text-on-surface-variant">
          {t("menu.noMatch", { query: query.trim() })}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section
              key={group.key}
              className="rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-2 shadow-[0_1px_2px_rgba(25,28,29,0.04)] sm:p-3"
            >
              <h2 className="flex items-baseline gap-2 px-3 pb-1 pt-2 sm:px-4">
                <span className="text-[15px] font-semibold text-on-surface">{labelFor(group.key)}</span>
                <span className="text-[13px] text-on-surface-variant">
                  {t("menu.count", { count: group.items.length })}
                </span>
              </h2>
              <ul className="flex flex-col">
                {group.items.map((service) => (
                  <ServiceRow
                    key={service.id}
                    companyId={companyId}
                    canEdit={canEdit}
                    service={service}
                    index={rowIndex++}
                    onEdit={() => setDrawer({ mode: "edit", id: service.id })}
                    onPatched={handlePatched}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {visibleInactive.length > 0 || (!isFiltering && inactive.length > 0) ? (
        <section className="rounded-[24px] border border-outline-variant/60 bg-surface-container-low/60 p-2 sm:p-3">
          <button
            type="button"
            aria-expanded={showInactive || isFiltering}
            onClick={() => setShowInactive((v) => !v)}
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] font-semibold text-on-surface-variant transition-colors hover:text-on-surface sm:px-4"
          >
            <ChevronRightIcon
              className={clsx(
                "h-4 w-4 transition-transform duration-200",
                (showInactive || isFiltering) && "rotate-90",
              )}
            />
            {t("menu.deactivated", { count: visibleInactive.length })}
          </button>
          {showInactive || isFiltering ? (
            <ul className="flex flex-col">
              {visibleInactive.map((service, i) => (
                <ServiceRow
                  key={service.id}
                  companyId={companyId}
                  canEdit={canEdit}
                  service={service}
                  index={i}
                  onEdit={() => setDrawer({ mode: "edit", id: service.id })}
                  onPatched={handlePatched}
                />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {defaultService ? <DefaultServiceCard companyId={companyId} service={defaultService} canEdit={canEdit} /> : null}

      <SideDrawer
        open={drawer !== null}
        title={editing ? t("menu.editTitle", { name: editing.name }) : t("menu.addTitle")}
        closeLabel={t("closeDialogLabel")}
        onClose={() => setDrawer(null)}
      >
        {drawer?.mode === "create" ? (
          <ServiceForm
            companyId={companyId}
            mode="create"
            companyCurrency={companyCurrency}
            categories={categoryNames}
            professionals={professionals}
            onSaved={handleSaved}
            onCancel={() => setDrawer(null)}
          />
        ) : editing ? (
          <ServiceForm
            key={editing.id}
            companyId={companyId}
            mode="edit"
            companyCurrency={companyCurrency}
            categories={categoryNames}
            professionals={professionals}
            service={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawer(null)}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}
