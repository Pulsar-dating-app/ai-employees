"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";

export type ProfessionalListItem = {
  id: string;
  name: string;
  isActive: boolean;
  position: number;
  usesCustomHours: boolean;
  // Linked to the signed-in team member ("Você").
  isMe: boolean;
  calendarConnected: boolean;
  // Services explicitly linked to this professional (empty = does every
  // service that isn't restricted to someone else).
  serviceNames: string[];
};

const FIELD_CLASSES =
  "h-11 w-full min-w-0 rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)]";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfessionalsManager({
  companyId,
  isAdmin,
  initialProfessionals,
}: {
  companyId: string;
  isAdmin: boolean;
  initialProfessionals: ProfessionalListItem[];
}) {
  const t = useTranslations("Scheduling.professionals");
  const router = useRouter();
  const [professionals, setProfessionals] = useState(initialProfessionals);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const active = professionals.filter((p) => p.isActive).sort((a, b) => a.position - b.position);
  const inactive = professionals.filter((p) => !p.isActive);

  async function add() {
    const name = newName.trim();
    if (!name) {
      setError(t("nameRequired"));
      return;
    }
    setBusyId("new");
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/professionals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      setError(t("saveError"));
      return;
    }
    const { professional } = await res.json();
    setProfessionals((prev) => [...prev, { ...professional, isMe: false, serviceNames: [] }]);
    setNewName("");
    setAdding(false);
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/professionals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusyId(null);
    if (!res) {
      setError(t("saveError"));
      return false;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.error === "last_active_professional") setError(t("lastActiveError"));
      else if (json?.error === "has_upcoming_appointments") setError(t("upcomingError", { count: json.count ?? 0 }));
      else setError(t("saveError"));
      return false;
    }
    return true;
  }

  async function setActive(id: string, isActive: boolean) {
    if (await patch(id, { isActive })) {
      setProfessionals((prev) => prev.map((p) => (p.id === id ? { ...p, isActive } : p)));
      router.refresh();
    }
  }

  // Swap positions with the neighbour -- the order is the one Ana follows
  // when naming professionals to customers.
  // Positions are rewritten as 0..n-1 in the new order, so ties left by
  // older rows can't make the order ambiguous.
  async function move(id: string, direction: -1 | 1) {
    const index = active.findIndex((p) => p.id === id);
    if (!active[index + direction]) return;
    const order = [...active];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    for (const [position, p] of order.entries()) {
      if (p.position !== position && !(await patch(p.id, { position }))) return;
    }
    const positions = new Map(order.map((p, position) => [p.id, position]));
    setProfessionals((prev) => prev.map((p) => (positions.has(p.id) ? { ...p, position: positions.get(p.id)! } : p)));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-on-surface">{t("title")}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-on-surface-variant">{t("subtitle")}</p>
        </div>
        {isAdmin && !adding ? (
          <Button type="button" onClick={() => setAdding(true)} className="self-start sm:self-auto">
            <PlusIcon className="h-4 w-4" />
            {t("addButton")}
          </Button>
        ) : null}
      </div>

      {active.length === 1 && isAdmin ? (
        <StatusBanner tone="info" title={t("singleTitle")} body={t("singleBody")} />
      ) : null}

      {adding ? (
        <div className="flex flex-col gap-3 rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-5 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant">
            {t("nameLabel")}
            <input
              id="new-professional-name"
              autoFocus
              className={FIELD_CLASSES}
              value={newName}
              maxLength={120}
              placeholder={t("namePlaceholder")}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" isLoading={busyId === "new"} onClick={add}>
              {t("addConfirm")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setError(null);
              }}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest">
        {active.map((p, index) => (
          <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-sm font-semibold text-primary"
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
                  <span className="truncate">{p.name}</span>
                  {p.isMe ? (
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                      {t("you")}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[13px] text-on-surface-variant">
                  {p.usesCustomHours ? t("ownHours") : t("inheritedHours")}
                  {" · "}
                  {p.serviceNames.length > 0
                    ? `${p.serviceNames.slice(0, 3).join(", ")}${p.serviceNames.length > 3 ? "…" : ""}`
                    : t("allServices")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                  p.calendarConnected ? "bg-success-100 text-success-500" : "bg-surface-container text-on-surface-variant",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx("h-1.5 w-1.5 rounded-full", p.calendarConnected ? "bg-success-500" : "bg-outline")}
                />
                {p.calendarConnected ? t("googleConnected") : t("googleNotConnected")}
              </span>
              {isAdmin && active.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label={t("moveUp", { name: p.name })}
                    disabled={index === 0 || busyId !== null}
                    onClick={() => move(p.id, -1)}
                    className="rounded-lg px-2 py-1 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:invisible"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown", { name: p.name })}
                    disabled={index === active.length - 1 || busyId !== null}
                    onClick={() => move(p.id, 1)}
                    className="rounded-lg px-2 py-1 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:invisible"
                  >
                    ↓
                  </button>
                </>
              ) : null}
              {isAdmin && active.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isLoading={busyId === p.id}
                  onClick={() => setActive(p.id, false)}
                >
                  {t("deactivate")}
                </Button>
              ) : null}
              <Link
                href={`/dashboard/scheduling/professionals/${p.id}`}
                className="inline-flex items-center gap-1 rounded-xl border border-outline-variant px-3 py-1.5 text-[13px] font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
              >
                {t("manage")}
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {inactive.length > 0 ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className="self-start text-sm font-medium text-on-surface-variant hover:text-primary"
          >
            {showInactive ? t("hideInactive") : t("showInactive", { count: inactive.length })}
          </button>
          {showInactive ? (
            <ul className="flex flex-col divide-y divide-outline-variant/40 rounded-[24px] border border-outline-variant/60 bg-surface-container-low">
              {inactive.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="truncate text-sm text-on-surface-variant">{p.name}</span>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      isLoading={busyId === p.id}
                      onClick={() => setActive(p.id, true)}
                    >
                      {t("reactivate")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
