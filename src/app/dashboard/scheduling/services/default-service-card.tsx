"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import type { Service } from "./services-manager";

// The per-company catch-all service (services.is_default). Merchant flips it
// on/off and can rename it / set its duration; it's never listed among the
// normal services or offered to a customer as a pickable option. When on,
// Ana books an in-domain request that matches no listed service under this
// one (see list_services' tool description + Ana's prompt).
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

  const [active, setActive] = useState(service.is_active);
  const [name, setName] = useState(service.name);
  const [savedName, setSavedName] = useState(service.name);
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          {canEdit ? (
            <label className="flex shrink-0 items-center gap-2 pt-1">
              <span className="text-label-md text-on-surface-variant">
                {active ? t("onLabel") : t("offLabel")}
              </span>
              <Toggle checked={active} onChange={toggleActive} label={t("toggleAria")} />
            </label>
          ) : (
            <span className="pt-1 text-label-md text-on-surface-variant">
              {active ? t("onLabel") : t("offLabel")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="rounded-md bg-surface-container-low px-3 py-2 text-label-md text-on-surface-variant">
          {t("explainer")}
        </p>

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

        {canEdit && status === "error" ? (
          <p role="alert" className="text-sm text-error">
            {t("saveError")}
          </p>
        ) : canEdit && status === "saved" ? (
          <p className="text-sm text-tertiary">{t("saved")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
