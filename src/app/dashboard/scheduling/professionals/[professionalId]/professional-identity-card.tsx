"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SettingsBlock } from "@/components/ui/settings-block";

const FIELD_CLASSES =
  "h-11 w-full min-w-0 rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] disabled:cursor-not-allowed disabled:opacity-60";

// Maps the API's email errors to copy.
export function emailErrorKey(code: unknown): "emailInOtherCompany" | "emailTaken" | "emailInvalid" | null {
  if (code === "email_in_other_company") return "emailInOtherCompany";
  if (code === "email_taken_in_company" || code === "account_already_linked") return "emailTaken";
  if (code === "invalid_email") return "emailInvalid";
  return null;
}

// Name and login email. A professional's name is shown to customers when the
// business has more than one; the email is how they log in to their own
// agenda (2026-09-25): linked to their account once they sign up with it,
// pending until then. Only owners/admins change either; the professional
// sees them read-only.
export function ProfessionalIdentityCard({
  companyId,
  professionalId,
  initialName,
  inviteEmail,
  accountEmail,
  linked,
  isSelf,
  isAdmin,
}: {
  companyId: string;
  professionalId: string;
  initialName: string;
  inviteEmail: string | null;
  accountEmail: string | null;
  linked: boolean;
  isSelf: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("Scheduling.professionals");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(inviteEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const emailDirty = !linked && email.trim().toLowerCase() !== (inviteEmail ?? "");
  const dirty = name.trim() !== initialName || emailDirty;

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/companies/${companyId}/professionals/${professionalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      const key = emailErrorKey(json?.error);
      setStatus({ tone: "error", text: key ? t(key) : t("saveError") });
      return false;
    }
    return true;
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus({ tone: "error", text: t("nameRequired") });
      return;
    }
    const body: Record<string, unknown> = {};
    if (trimmed !== initialName) body.name = trimmed;
    if (emailDirty) body.email = email.trim() ? email.trim() : null;
    setSaving(true);
    setStatus(null);
    const ok = await patch(body);
    setSaving(false);
    if (!ok) return;
    setStatus({ tone: "ok", text: t("saved") });
    router.refresh();
  }

  async function unlink() {
    if (!window.confirm(isSelf ? t("unlinkSelfConfirm") : t("unlinkConfirm", { name: initialName }))) return;
    setUnlinking(true);
    setStatus(null);
    const ok = await patch({ unlink: true });
    setUnlinking(false);
    if (ok) router.refresh();
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
            disabled={!isAdmin}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {linked ? (
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant">
            <span>{t("emailLabel")}</span>
            <div className="flex min-h-11 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-sm text-on-surface">{accountEmail ?? "—"}</span>
              <AccessPill tone="active">{t("accessActive")}</AccessPill>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={unlink}
                disabled={unlinking}
                className="self-start text-[12px] font-medium text-error hover:underline disabled:opacity-60"
              >
                {t("unlink")}
              </button>
            ) : null}
          </div>
        ) : (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant">
            <span className="flex items-center gap-2">
              {t("emailLabel")}
              {inviteEmail ? <AccessPill tone="pending">{t("accessPending")}</AccessPill> : null}
            </span>
            <input
              id="professional-email"
              type="email"
              className={FIELD_CLASSES}
              value={email}
              maxLength={254}
              autoComplete="off"
              placeholder={t("emailPlaceholder")}
              disabled={!isAdmin}
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="text-[12px] font-normal text-on-surface-variant">
              {inviteEmail ? t("pendingHint", { name: initialName }) : t("noEmailHint", { name: initialName })}
            </span>
          </label>
        )}
      </div>
      {isAdmin ? (
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

export function AccessPill({ tone, children }: { tone: "active" | "pending"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "active" ? "bg-success-100 text-success-500" : "bg-amber-50 text-amber-700",
      )}
    >
      {children}
    </span>
  );
}
