"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import type { ConversationRow } from "@/lib/conversations/list";
import type { ConversationMessage } from "@/lib/conversations/detail";
import { ConversationPane, type ConversationData } from "./conversation-pane";
import { InboxList } from "./inbox-list";
import { InboxOverview } from "./inbox-overview";
import { groupRows } from "./inbox-format";

export type InboxFilters = {
  status: "all" | "paused" | "active" | "closed";
  search: string;
  pendingOnly: boolean;
};

const DEFAULT_FILTERS: InboxFilters = { status: "all", search: "", pendingOnly: false };
const LIST_POLL_INTERVAL_MS = 15000;
const MAX_PAGE_SIZE = 100;

function buildParams(filters: InboxFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.pendingOnly) params.set("pending", "true");
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

const COMPACT_QUERY = "(max-width: 1023.98px)";

function subscribeCompact(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsCompact() {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function ConversationsInbox({
  companyId,
  initialRows,
  initialTotal,
  initialPendingTotal,
  initialSelected,
  pageSize,
}: {
  companyId: string;
  initialRows: ConversationRow[];
  initialTotal: number;
  initialPendingTotal: number;
  initialSelected: ConversationData | null;
  pageSize: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("c");
  const isCompact = useIsCompact();

  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [pendingTotal, setPendingTotal] = useState(initialPendingTotal);
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set(initialRows.map((r) => r.id)));

  const [cache, setCache] = useState(
    () =>
      new Map<string, ConversationData>(initialSelected ? [[initialSelected.conversation.id, initialSelected]] : []),
  );
  const pushedRef = useRef(false);
  const requestRef = useRef(0);
  const liveRef = useRef({ filters, rowCount: rows.length, rows });

  useEffect(() => {
    liveRef.current = { filters, rowCount: rows.length, rows };
  });

  const orderedIds = groupRows(rows).flatMap((g) => g.rows.map((r) => r.id));
  const selectedRow = rows.find((r) => r.id === selectedId);

  const select = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      const url = `${pathname}?c=${encodeURIComponent(id)}`;
      if (selectedId) {
        window.history.replaceState(null, "", url);
      } else {
        window.history.pushState(null, "", url);
        pushedRef.current = true;
      }
    },
    [pathname, selectedId],
  );

  const close = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", pathname);
    }
  }, [pathname]);

  async function load(nextFilters: InboxFilters, mode: "replace" | "append" | "poll") {
    const requestId = ++requestRef.current;
    const loaded = liveRef.current.rowCount;
    const page = mode === "append" ? Math.floor(loaded / pageSize) + 1 : 1;
    const size = mode === "poll" ? Math.min(Math.max(pageSize, loaded), MAX_PAGE_SIZE) : pageSize;

    if (mode === "replace") setIsLoading(true);
    if (mode === "append") setIsLoadingMore(true);

    const res = await fetch(`/api/companies/${companyId}/conversations?${buildParams(nextFilters, page, size)}`).catch(
      () => null,
    );

    if (mode === "replace") setIsLoading(false);
    if (mode === "append") setIsLoadingMore(false);
    if (!res?.ok || (mode !== "append" && requestId !== requestRef.current)) return;

    const json = await res.json();
    const incoming: ConversationRow[] = json.conversations ?? [];
    const known = new Set(liveRef.current.rows.map((r) => r.id));

    if (mode === "append") {
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...incoming.filter((r) => !seen.has(r.id))];
      });
      setNewIds(new Set(incoming.filter((r) => !known.has(r.id)).map((r) => r.id)));
    } else {
      setRows(incoming);
      setNewIds(
        mode === "replace"
          ? new Set(incoming.map((r) => r.id))
          : new Set(incoming.filter((r) => !known.has(r.id)).map((r) => r.id)),
      );
    }
    setTotal(json.total ?? 0);
    if (typeof json.pendingTotal === "number") setPendingTotal(json.pendingTotal);
  }

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.hidden) return;
      loadRef.current(liveRef.current.filters, "poll");
    }, LIST_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  function handleFiltersChange(partial: Partial<InboxFilters>) {
    const next = { ...filters, ...partial };
    setFilters(next);
    load(next, "replace");
  }

  const updateRow = useCallback((id: string, patch: (row: ConversationRow) => ConversationRow, toTop = false) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === id);
      if (index === -1) return prev;
      const updated = patch(prev[index]);
      if (updated === prev[index]) return prev;
      const rest = prev.filter((r) => r.id !== id);
      return toTop ? [updated, ...rest] : prev.map((r) => (r.id === id ? updated : r));
    });
  }, []);

  const handleLoaded = useCallback(
    (data: ConversationData) => {
      const last = data.messages[data.messages.length - 1];
      setCache((prev) => {
        const existing = prev.get(data.conversation.id);
        const existingLast = existing?.messages[existing.messages.length - 1];
        if (
          existing &&
          existing.conversation.status === data.conversation.status &&
          existing.messages.length === data.messages.length &&
          existingLast?.created_at === last?.created_at
        ) {
          return prev;
        }
        return new Map(prev).set(data.conversation.id, data);
      });
      updateRow(data.conversation.id, (row) => {
        const sameStatus = row.status === data.conversation.status;
        const sameLast = !last || row.lastMessage?.created_at === last.created_at;
        if (sameStatus && sameLast) return row;
        return {
          ...row,
          status: data.conversation.status,
          lastMessage: last ? { content: last.content, created_at: last.created_at, role: last.role } : row.lastMessage,
        };
      });
    },
    [updateRow],
  );

  function handleReplySent(message: ConversationMessage) {
    if (!selectedId) return;
    updateRow(
      selectedId,
      (row) => ({
        ...row,
        status: "paused",
        updatedAt: message.created_at,
        pendingConfirmation: false,
        lastMessage: { content: message.content, created_at: message.created_at, role: message.role },
      }),
      true,
    );
  }

  function handleStatusChange(status: string) {
    if (!selectedId) return;
    updateRow(selectedId, (row) => ({ ...row, status }));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const down = e.key === "ArrowDown" || e.key === "j";
      const up = e.key === "ArrowUp" || e.key === "k";
      if (e.key === "Escape" && selectedId && isCompact) {
        close();
        return;
      }
      if (!down && !up) return;
      if (orderedIds.length === 0) return;
      e.preventDefault();
      const index = selectedId ? orderedIds.indexOf(selectedId) : -1;
      const nextIndex = index === -1 ? 0 : Math.min(Math.max(index + (down ? 1 : -1), 0), orderedIds.length - 1);
      const nextId = orderedIds[nextIndex];
      select(nextId);
      document.querySelector(`[data-conversation-id="${nextId}"]`)?.scrollIntoView({ block: "nearest" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderedIds, selectedId, select, close, isCompact]);

  useEffect(() => {
    if (!selectedId || !isCompact) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedId, isCompact]);

  const pane = selectedId ? (
    <div key={selectedId} className="inbox-pane-in h-full">
      <ConversationPane
        companyId={companyId}
        conversationId={selectedId}
        row={selectedRow}
        cached={cache.get(selectedId)}
        onLoaded={handleLoaded}
        onBack={close}
        onReplySent={handleReplySent}
        onStatusChange={handleStatusChange}
      />
    </div>
  ) : null;

  return (
    <div className="lg:grid lg:h-[calc(100dvh-9rem)] lg:min-h-[460px] lg:grid-cols-[minmax(320px,380px)_1fr] lg:overflow-hidden lg:rounded-[28px] lg:border lg:border-outline-variant/60 lg:bg-surface-container-lowest lg:shadow-[0_1px_2px_rgba(25,28,29,0.04),0_24px_60px_-24px_rgba(53,37,205,0.18)]">
      <div className="min-h-0 overflow-hidden rounded-[28px] border border-outline-variant/60 bg-surface-container-low/80 shadow-level1 backdrop-blur lg:rounded-none lg:border-0 lg:border-r lg:shadow-none">
        <InboxList
          rows={rows}
          total={total}
          pendingTotal={pendingTotal}
          filters={filters}
          selectedId={selectedId}
          newIds={newIds}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          onSelect={select}
          onFiltersChange={handleFiltersChange}
          onLoadMore={() => load(filters, "append")}
        />
      </div>

      <div className="min-h-0 bg-surface max-lg:hidden">
        {isCompact ? null : (pane ?? <InboxOverview rows={rows} onOpen={select} />)}
      </div>

      {isCompact && pane
        ? createPortal(
            <div className="inbox-sheet fixed inset-0 z-[60] bg-surface pb-[env(safe-area-inset-bottom)]">{pane}</div>,
            document.body,
          )
        : null}
    </div>
  );
}
