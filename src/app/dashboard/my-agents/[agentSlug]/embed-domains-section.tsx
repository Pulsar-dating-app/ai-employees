"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LockIcon, InfoIcon } from "@/components/ui/icons";
import { ChannelPanelHeader } from "./channel-panel-header";

type EmbedDomainsSectionProps = {
  companyId: string;
  agentName: string;
  canEdit: boolean;
  initialDomains: string[];
};

// Trello M7's domain allowlist (companies.allowed_embed_domains, from M1) --
// moved here (2026-09-10) from its original home on the Settings page, next
// to the widget it actually gates, since that's where a merchant configuring
// the embed widget was already looking rather than a separate page. Same
// column, same PATCH /api/companies/[companyId] endpoint, same
// whole-array-replace save shape as FaqSection's list editor -- nothing
// moved at the data layer, only where this is mounted (see page.tsx's own
// comment on this same follow-up).
//
// Rendered in every hire's Embed tab, not gated to one agent -- the
// `sharedScopeNote` callout below says so explicitly, since this is the one
// panel in that tab that ISN'T scoped to just the agent whose page you're
// on: saving here changes what's allowed for every hired team member's
// embed widget at once.
export function EmbedDomainsSection({ companyId, agentName, canEdit, initialDomains }: EmbedDomainsSectionProps) {
  const t = useTranslations("MyAgents.embedDomains");
  const tCommon = useTranslations("Teach");

  const [domains, setDomains] = useState<string[]>(initialDomains.length > 0 ? initialDomains : [""]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  function updateDomain(index: number, value: string) {
    setDomains((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  function addDomain() {
    setDomains((prev) => [...prev, ""]);
  }

  function removeDomain(index: number) {
    setDomains((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveState("idle");
    setErrorDetail(null);

    const cleaned = domains.map((d) => d.trim()).filter(Boolean);

    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_embed_domains: cleaned }),
    });

    setIsSaving(false);
    if (res.ok) {
      const { company } = await res.json();
      const saved: string[] = company.allowed_embed_domains ?? [];
      setDomains(saved.length > 0 ? saved : [""]);
      setSaveState("success");
    } else {
      const body = await res.json().catch(() => null);
      setErrorDetail(body?.error ?? null);
      setSaveState("error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ChannelPanelHeader
        icon={<LockIcon className="h-5 w-5" />}
        tileClassName="bg-primary-fixed text-primary"
        title={t("title")}
        description={t("description")}
      />

      <div className="flex items-start gap-3 rounded-lg bg-tertiary-container/10 p-4">
        <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-tertiary-container" />
        <p className="text-sm leading-relaxed text-on-surface-variant">{t("sharedScopeNote", { name: agentName })}</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-on-surface-variant">
          {domains.every((d) => !d.trim()) ? t("emptyStateWarning") : null}
        </p>

        {domains.map((domain, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={index === 0 ? t("domainLabel") : undefined}
                placeholder={t("domainPlaceholder")}
                value={domain}
                onChange={(e) => updateDomain(index, e.target.value)}
                disabled={!canEdit}
                maxLength={255}
              />
            </div>
            {canEdit ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeDomain(index)}>
                {t("removeButton")}
              </Button>
            ) : null}
          </div>
        ))}

        {canEdit ? (
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={addDomain}>
              {t("addButton")}
            </Button>
          </div>
        ) : null}

        {saveState === "error" ? (
          <p role="alert" className="text-sm text-error">
            {errorDetail ?? tCommon("saveError")}
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="button" isLoading={isSaving} onClick={handleSave}>
              {isSaving ? tCommon("saving") : tCommon("save")}
            </Button>
            {saveState === "success" ? (
              <span className="text-sm text-tertiary-container">{tCommon("saved")}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
