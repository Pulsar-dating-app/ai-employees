"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckIcon, XIcon, BadgeCheckIcon } from "@/components/ui/icons";

type Stage = "browsing" | "confirming" | "hired";

function TraitChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-label-sm font-semibold text-on-surface-variant">
      {children}
    </span>
  );
}

export function AgentHireFlow({
  agentSlug,
  name,
  role,
  description,
  photoSrc,
  traits,
  should,
  never,
  monthlyPriceBRL,
  companyId,
  initialIsHired,
}: {
  agentSlug: string;
  name: string;
  role: string;
  description: string;
  photoSrc: string | null;
  traits: string[];
  should: string[];
  never: string[];
  monthlyPriceBRL: number;
  companyId: string | null;
  initialIsHired: boolean;
}) {
  const t = useTranslations("AgentDetail");
  const tTraits = useTranslations("Marketplace.traits");
  const tShould = useTranslations("AgentDetail.should");
  const tNever = useTranslations("AgentDetail.never");
  const router = useRouter();

  const [stage, setStage] = useState<Stage>(initialIsHired ? "hired" : "browsing");
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirmHire() {
    setErrorMessage(null);
    let effectiveCompanyId = companyId;

    if (!effectiveCompanyId) {
      const trimmed = businessName.trim();
      if (!trimmed) {
        setErrorMessage(t("businessNameMissing"));
        return;
      }

      setIsSubmitting(true);
      const companyRes = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!companyRes.ok) {
        setErrorMessage(t("companyCreateError"));
        setIsSubmitting(false);
        return;
      }

      const { company } = await companyRes.json();
      effectiveCompanyId = company.id;
    } else {
      setIsSubmitting(true);
    }

    const hireRes = await fetch(`/api/companies/${effectiveCompanyId}/agents/${agentSlug}`, {
      method: "POST",
    });

    setIsSubmitting(false);

    if (!hireRes.ok) {
      setErrorMessage(t("hireError", { name }));
      return;
    }

    setStage("hired");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-5">
        <AgentAvatar role="intent" size="lg" photoSrc={photoSrc} alt={name} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-headline-lg font-semibold text-on-surface">{name}</h1>
            <BadgeCheckIcon className="h-5 w-5 text-primary" />
          </div>
          <p className="text-body-md font-medium text-primary">{role}</p>
        </div>
      </div>

      {description ? (
        <p className="text-body-md leading-relaxed text-on-surface-variant">{description}</p>
      ) : null}

      {traits.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {traits.map((trait) => (
            <TraitChip key={trait}>{tTraits(trait)}</TraitChip>
          ))}
        </div>
      ) : null}

      {should.length > 0 || never.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {should.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <h2 className="text-sm font-semibold text-on-surface">{t("shouldTitle", { name })}</h2>
              {should.map((key) => (
                <div key={key} className="flex items-start gap-2 text-sm text-on-surface-variant">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-tertiary-container" />
                  {tShould(key)}
                </div>
              ))}
            </div>
          ) : null}
          {never.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <h2 className="text-sm font-semibold text-on-surface">{t("neverTitle", { name })}</h2>
              {never.map((key) => (
                <div key={key} className="flex items-start gap-2 text-sm text-on-surface-variant">
                  <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-outline" />
                  {tNever(key)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardContent>
          {stage === "hired" ? (
            <div className="flex flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary-container/40 px-2.5 py-1 text-xs font-semibold text-on-secondary-container">
                {t("hiredBadge", { name })}
              </span>
              <p className="text-sm text-on-surface-variant">{t("hiredDescription", { name })}</p>
              <Link href={`/dashboard/my-agents/${agentSlug}`}>
                <Button type="button">{t("goToSettings")}</Button>
              </Link>
            </div>
          ) : stage === "confirming" ? (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-on-surface">{t("mockPaymentTitle")}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">{t("mockPaymentSubtitle")}</p>
              </div>

              {!companyId ? (
                <Input
                  label={t("businessNameLabel")}
                  placeholder={t("businessNamePlaceholder")}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label={t("cardNumberLabel")} value="4242 4242 4242 4242" disabled />
                <Input label={t("cardNameLabel")} value={businessName || name} disabled />
                <Input label={t("cardExpiryLabel")} value="12/30" disabled />
                <Input label={t("cardCvcLabel")} value="123" disabled />
              </div>

              {errorMessage ? (
                <p role="alert" className="text-sm text-error">
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <Button type="button" isLoading={isSubmitting} onClick={handleConfirmHire}>
                  {isSubmitting ? t("confirming") : t("confirmHire", { price: monthlyPriceBRL })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() => setStage("browsing")}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <span className="text-lg font-semibold text-on-surface">
                {t("priceLabel", { price: monthlyPriceBRL })}
              </span>
              <div>
                <Button type="button" onClick={() => setStage("confirming")}>
                  {t("hireButton", { name })}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
