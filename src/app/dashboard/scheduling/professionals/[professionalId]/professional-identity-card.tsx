"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { CHEVRON } from "@/components/ui/select";
import { SettingsBlock } from "@/components/ui/settings-block";

export type MemberOption = { userId: string; label: string };

const FIELD_CLASSES =
  "h-11 w-full min-w-0 rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] disabled:cursor-not-allowed disabled:opacity-60";

// Name, and (admins only) which team member manages this professional's own
// schedule. A professional's name is shown to customers when the business
// has more than one.
export function ProfessionalIdentityCard({
  companyId,
  professionalId,
  initialName,
  initialUserId,
  canManage,
  isAdmin,
  members,
}: {
  companyId: string;
  professionalId: string;
  initialName: string;
  initialUserId: string | null;
  canManage: boolean;
  isAdmin: boolean;
  members: MemberOption[];
}) {
  const t = useTranslations("Scheduling.professionals");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [userId, setUserId] = useState(initialUserId ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const dirty = name.trim() !== initialName || (isAdmin && (userId || null) !== initialUserId);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus({ tone: "error", text: t("nameRequired") });
      return;
    }
    const body: Record<string, unknown> = {};
    if (trimmed !== initialName) body.name = trimmed;
    if (isAdmin && (userId || null) !== initialUserId) body.userId = userId || null;
    setSaving(true);
    setStatus(null);
    const res = await fetch(`/api/companies/${companyId}/professionals/${professionalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      setStatus({ tone: "error", text: json?.error === "user_already_linked" ? t("memberTaken") : t("saveError") });
      return;
    }
    setStatus({ tone: "ok", text: t("saved") });
    router.refresh();
  }

  return (
    <SettingsBlock id="identity" title={t("identityTitle")} description={t("identitySubtitle")}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant">
          {t("nameLabel")}
          <input
            id="professional-name"
            className={FIELD_CLASSES}
            value={name}
            maxLength={120}
            disabled={!canManage}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {isAdmin ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant">
            {t("memberLabel")}
            <select
              id="professional-member"
              className={clsx(FIELD_CLASSES, CHEVRON)}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">{t("memberNone")}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="text-[12px] font-normal text-on-surface-variant">{t("memberHint")}</span>
          </label>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {status ? (
            <p
              role={status.tone === "error" ? "alert" : "status"}
              className={clsx("mr-auto text-sm", status.tone === "error" ? "text-error" : "text-success-500")}
            >
              {status.text}
            </p>
          ) : null}
          <Button type="button" isLoading={saving} disabled={!dirty} onClick={save}>
            {t("save")}
          </Button>
        </div>
      ) : null}
    </SettingsBlock>
  );
}
