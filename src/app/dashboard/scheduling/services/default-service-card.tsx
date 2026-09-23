"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import type { Service } from "./services-manager";

export function DefaultServiceCard({
  companyId,
  service,
  canEdit,
}: {
  companyId: string;
  service: Service;
  canEdit: boolean;
}) {
  const t = useTranslations("Services.default");
  const tMenu = useTranslations("Services.menu");
  const [open, setOpen] = useState(false);

  const [active, setActive] = useState(service.is_active);
  const [name, setName] = useState(service.name);
  const [savedName, setSavedName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [savedDescription, setSavedDescription] = useState(service.description ?? "");
  const [duration, setDuration] = useState(String(service.duration_minutes));
  const [savedDuration, setSavedDuration] = useState(service.duration_minutes);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setStatus("saving");
    try {
      const res = await fetch(`/api/companies/${companyId}/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus(res.ok ? "saved" : "error");
      return res.ok;
    } catch {
      setStatus("error");
      return false;
    }
  }

  async function toggleActive(next: boolean) {
    setActive(next);
    if (!(await patch({ is_active: next }))) setActive(!next);
  }

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedName) {
      if (!trimmed) setName(savedName);
      return;
    }
    if (await patch({ name: trimmed })) {
      setName(trimmed);
      setSavedName(trimmed);
    }
  }

  async function commitDescription() {
    const trimmed = description.trim();
    if (trimmed === savedDescription) return;
    if (await patch({ description: trimmed || null })) {
      setDescription(trimmed);
      setSavedDescription(trimmed);
    } else {
      setDescription(savedDescription);
    }
  }

  async function commitDuration() {
    const n = Number(duration);
    if (!Number.isInteger(n) || n <= 0) {
      setDuration(String(savedDuration));
      return;
    }
    if (n === savedDuration) return;
    if (await patch({ duration_minutes: n })) {
      setSavedDuration(n);
    } else {
      setDuration(String(savedDuration));
    }
  }

  return (
    <section className="rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-on-surface">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">{t("description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canEdit ? (
            <label className="flex items-center gap-2">
              <span className="text-label-md text-on-surface-variant">{active ? t("onLabel") : t("offLabel")}</span>
              <Toggle checked={active} onChange={toggleActive} label={t("toggleAria")} />
            </label>
          ) : (
            <span className="text-label-md text-on-surface-variant">{active ? t("onLabel") : t("offLabel")}</span>
          )}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-[border-color,color] hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {open ? tMenu("defaultClose") : tMenu("defaultEdit")}
          </button>
        </div>
      </div>

      {open ? (
        <div className="inbox-pane-in mt-5 flex flex-col gap-4 border-t border-outline-variant/50 pt-5">
          <p className="text-sm leading-6 text-on-surface-variant">{t("explainer")}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t("nameLabel")}
              value={name}
              maxLength={255}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
            />
            <Input
              label={t("durationLabel")}
              type="number"
              min={1}
              inputMode="numeric"
              value={duration}
              disabled={!canEdit}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
          <div>
            <Textarea
              label={t("descriptionLabel")}
              value={description}
              disabled={!canEdit}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              rows={3}
            />
            <p className="mt-1.5 text-xs text-on-surface-variant">{t("descriptionHint")}</p>
          </div>
        </div>
      ) : null}

      {canEdit && status === "error" ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {t("saveError")}
        </p>
      ) : canEdit && status === "saved" ? (
        <p className="mt-3 text-sm text-success-500">{t("saved")}</p>
      ) : null}
    </section>
  );
}
