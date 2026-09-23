"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { CartIcon, ClockIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import type { ConversationRow } from "@/lib/conversations/list";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { CustomerAvatar } from "./customer-avatar";
import { formatListTime, groupRows } from "./inbox-format";
import type { InboxFilters } from "./conversations-inbox";

const STATUS_TABS = ["all", "paused", "active", "closed"] as const;

function StatusTabs({
  value,
  onChange,
}: {
  value: InboxFilters["status"];
  onChange: (s: InboxFilters["status"]) => void;
}) {
  const t = useTranslations("Conversations.inbox.tabs");
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(value, null, "x");

  return (
    <div role="tablist" className="relative flex rounded-xl bg-surface-container p-1">
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="inbox-indicator absolute left-0 rounded-lg bg-surface-container-lowest opacity-0 shadow-[0_1px_3px_rgba(25,28,29,0.12)]"
      />
      {STATUS_TABS.map((status) => (
        <button
          key={status}
          ref={register(status)}
          type="button"
          role="tab"
          aria-selected={value === status}
          onClick={() => onChange(status)}
          className={clsx(
            "relative z-10 flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-label-sm transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
            value === status ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          {t(status)}
        </button>
      ))}
    </div>
  );
}

function SearchField({ value, onSubmit }: { value: string; onSubmit: (search: string) => void }) {
  const t = useTranslations("Conversations");
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const [focused, setFocused] = useState(false);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="group relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline transition-colors group-focus-within:text-primary" />
        <input
          type="search"
          value={draft}
          aria-label={t("inbox.search.placeholder")}
          placeholder={t("inbox.search.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit(draft.trim());
            if (e.key === "Escape" && draft) {
              setDraft("");
              onSubmit("");
            }
          }}
          className="h-10 w-full rounded-xl border border-transparent bg-surface-container pl-9 pr-9 text-sm text-on-surface outline-none transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-outline focus:border-primary/40 focus:bg-surface-container-lowest focus:shadow-[0_0_0_4px_rgba(53,37,205,0.08)] [&::-webkit-search-cancel-button]:hidden"
        />
        {draft ? (
          <button
            type="button"
            aria-label={t("inbox.search.clear")}
            onClick={() => {
              setDraft("");
              onSubmit("");
            }}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <p
        className={clsx(
          "overflow-hidden px-1 text-[11px] leading-4 text-on-surface-variant transition-[max-height,opacity] duration-300",
          focused ? "max-h-16 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {t("filters.searchHint")}
      </p>
    </div>
  );
}

function SignalChips({ row }: { row: ConversationRow }) {
  const t = useTranslations("Conversations");
  if (!row.pendingConfirmation && !row.hotSignal) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {row.pendingConfirmation ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-0.5 text-[11px] font-semibold text-primary">
          <ClockIcon className="h-3 w-3" />
          {t("pending.rowBadge")}
        </span>
      ) : null}
      {row.hotSignal ? (
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            row.hotSignal === "checkout_click"
              ? "bg-success-100 text-success-500"
              : "bg-success-100/60 text-success-500",
          )}
        >
          <CartIcon className="h-3 w-3" />
          {t(row.hotSignal === "checkout_click" ? "hot.rowBadgeClick" : "hot.rowBadgeIntent")}
        </span>
      ) : null}
    </div>
  );
}

function Row({
  row,
  selected,
  isNew,
  index,
  onSelect,
  rowRef,
}: {
  row: ConversationRow;
  selected: boolean;
  isNew: boolean;
  index: number;
  onSelect: (id: string) => void;
  rowRef: (el: HTMLButtonElement | null) => void;
}) {
  const t = useTranslations("Conversations.inbox");
  const locale = useLocale();
  const last = row.lastMessage;
  const waitingOnYou = row.status === "paused" && last?.role === "customer";
  const prefix = last?.role === "merchant" ? t("you") : last?.role === "agent" ? row.agentName : null;

  return (
    <button
      ref={rowRef}
      type="button"
      data-conversation-id={row.id}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(row.id)}
      style={isNew ? { animationDelay: `${Math.min(index, 10) * 30}ms` } : undefined}
      className={clsx(
        "relative z-10 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
        !selected && "hover:bg-surface-container-lowest/60",
        isNew && "inbox-row-in",
      )}
    >
      <CustomerAvatar seed={row.customer.id} name={row.customer.displayName} channel={row.channel} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={clsx(
              "truncate text-sm",
              waitingOnYou ? "font-semibold text-on-surface" : "font-medium text-on-surface",
            )}
          >
            {row.customer.displayName}
          </span>
          <span
            className={clsx(
              "shrink-0 text-[11px] tabular-nums",
              waitingOnYou ? "font-semibold text-primary" : "text-outline",
            )}
          >
            {formatListTime(last?.created_at ?? row.updatedAt, locale, t("yesterday"))}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={clsx(
              "line-clamp-1 text-[13px] leading-5",
              waitingOnYou ? "text-on-surface" : "text-on-surface-variant",
            )}
          >
            {prefix ? <span className="font-medium text-on-surface">{prefix}: </span> : null}
            {last?.content ?? " "}
          </span>
          {waitingOnYou ? (
            <span aria-hidden="true" className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" />
          ) : null}
        </span>
        <SignalChips row={row} />
      </span>
    </button>
  );
}

export function InboxList({
  rows,
  total,
  pendingTotal,
  filters,
  selectedId,
  newIds,
  isLoading,
  isLoadingMore,
  onSelect,
  onFiltersChange,
  onLoadMore,
}: {
  rows: ConversationRow[];
  total: number;
  pendingTotal: number;
  filters: InboxFilters;
  selectedId: string | null;
  newIds: Set<string>;
  isLoading: boolean;
  isLoadingMore: boolean;
  onSelect: (id: string) => void;
  onFiltersChange: (partial: Partial<InboxFilters>) => void;
  onLoadMore: () => void;
}) {
  const t = useTranslations("Conversations.inbox");
  const groups = groupRows(rows);
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(selectedId, rows, "y");
  const isFiltered = filters.status !== "all" || filters.search !== "" || filters.pendingOnly;
  let rowIndex = 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2.5 px-3 pb-3 pt-3">
        <SearchField value={filters.search} onSubmit={(search) => onFiltersChange({ search })} />
        <StatusTabs value={filters.status} onChange={(status) => onFiltersChange({ status })} />
        {pendingTotal > 0 || filters.pendingOnly ? (
          <button
            type="button"
            aria-pressed={filters.pendingOnly}
            onClick={() => onFiltersChange({ pendingOnly: !filters.pendingOnly })}
            className={clsx(
              "inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              filters.pendingOnly
                ? "border-primary bg-primary text-on-primary"
                : "border-primary/25 bg-primary-fixed/60 text-primary hover:bg-primary-fixed",
            )}
          >
            <ClockIcon className="h-3.5 w-3.5" />
            {t("awaiting", { count: pendingTotal })}
          </button>
        ) : null}
      </div>

      <div className="relative h-0.5 overflow-hidden">
        {isLoading ? (
          <div className="animate-progress-sweep absolute inset-y-0 w-1/4 rounded-full bg-primary/60" />
        ) : null}
      </div>

      <div
        className={clsx(
          "chat-scroll relative min-h-0 flex-1 overflow-y-auto pb-4 transition-opacity duration-200",
          isLoading && "opacity-60",
        )}
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-6 py-10">
            <p className="text-sm font-semibold text-on-surface">
              {isFiltered ? t("empty.filteredTitle") : t("empty.title")}
            </p>
            {isFiltered ? (
              <button
                type="button"
                onClick={() => onFiltersChange({ status: "all", search: "", pendingOnly: false })}
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                {t("empty.clearFilters")}
              </button>
            ) : (
              <p className="max-w-xs text-sm leading-6 text-on-surface-variant">{t("empty.body")}</p>
            )}
          </div>
        ) : (
          <div className="relative px-2">
            <span
              ref={indicatorRef}
              aria-hidden="true"
              className="inbox-indicator pointer-events-none absolute left-2 right-2 top-0 rounded-xl bg-surface-container-lowest opacity-0 shadow-[0_1px_2px_rgba(25,28,29,0.06),0_8px_20px_-8px_rgba(53,37,205,0.22)] ring-1 ring-primary/10"
            />
            {groups.map(({ group, rows: groupRowsList }) => (
              <section
                key={group}
                aria-label={t(`groups.${group}`)}
                className={clsx(group === "needsYou" ? "mb-1 mt-2 rounded-2xl bg-primary-fixed/45 pb-1 pt-2" : "pt-3")}
              >
                <h3
                  className={clsx(
                    "flex items-center gap-2 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
                    group === "needsYou" ? "text-primary" : "text-outline",
                  )}
                >
                  {group === "needsYou" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  ) : null}
                  {group === "hot" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />
                  ) : null}
                  {t(`groups.${group}`)}
                  <span className="tabular-nums opacity-70">{groupRowsList.length}</span>
                </h3>
                <div className="flex flex-col">
                  {groupRowsList.map((row) => (
                    <Row
                      key={row.id}
                      row={row}
                      selected={row.id === selectedId}
                      isNew={newIds.has(row.id)}
                      index={rowIndex++}
                      onSelect={onSelect}
                      rowRef={register(row.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
            {rows.length < total ? (
              <div className="px-3 pt-3">
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={onLoadMore}
                  className="h-9 w-full rounded-xl text-[13px] font-semibold text-primary transition-colors hover:bg-primary-fixed/50 disabled:opacity-60"
                >
                  {isLoadingMore ? <span className="onboarding-loader align-middle" /> : t("loadMore")}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
