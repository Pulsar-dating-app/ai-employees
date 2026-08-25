"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepBadge } from "@/components/ui/step-badge";

type AgentOption = {
  id: string;
  slug: string;
  displayName: string;
  role: string | null;
  description: string | null;
};

type HireTeamCardProps = {
  availableAgents: AgentOption[];
  companyId: string | null;
};

// Renders one agent's profile — name, role, and bio. Used both for the
// selectable catalog entries (multi-agent) and the plain display (single
// agent) so "browsing the catalog" looks the same regardless of count.
function AgentProfile({ agent }: { agent: AgentOption }) {
  return (
    <div>
      <div className="flex flex-row flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-neutral-900">{agent.displayName}</span>
        {agent.role ? (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
            {agent.role}
          </span>
        ) : null}
      </div>
      {agent.description ? (
        <p className="mt-1 text-sm text-neutral-500">{agent.description}</p>
      ) : null}
    </div>
  );
}

// The only interactive piece of the onboarding shell. With one available
// agent this renders her profile plainly; with more than one, it becomes a
// real catalog you browse and pick from — nothing here assumes a specific
// agent, or how many there are.
export function HireTeamCard({ availableAgents, companyId }: HireTeamCardProps) {
  const t = useTranslations("HireTeam");
  const router = useRouter();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    availableAgents.length === 1 ? availableAgents[0].id : null,
  );
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedAgent = availableAgents.find((a) => a.id === selectedAgentId) ?? null;
  const isMultiChoice = availableAgents.length > 1;

  async function handleHire() {
    if (!selectedAgent) return;

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

    const hireRes = await fetch(
      `/api/companies/${effectiveCompanyId}/agents/${selectedAgent.slug}`,
      { method: "POST" },
    );

    if (!hireRes.ok) {
      setErrorMessage(t("hireGenericError", { name: selectedAgent.displayName }));
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center gap-3">
          <StepBadge status="active" />
          <CardTitle>{t("sectionTitle")}</CardTitle>
        </div>
        <CardDescription>{t("sectionSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isMultiChoice ? (
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">{t("pickPrompt")}</p>
            <div role="radiogroup" className="flex flex-col gap-2">
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  role="radio"
                  aria-checked={agent.id === selectedAgentId}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={clsx(
                    "rounded-md border p-3 text-left transition-colors",
                    agent.id === selectedAgentId
                      ? "border-accent-500 bg-accent-50"
                      : "border-neutral-300 hover:bg-neutral-50",
                  )}
                >
                  <AgentProfile agent={agent} />
                </button>
              ))}
            </div>
          </div>
        ) : selectedAgent ? (
          <div className="rounded-md border border-neutral-200 p-3">
            <AgentProfile agent={selectedAgent} />
          </div>
        ) : null}

        {!companyId ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-600">{t("businessNamePrompt")}</p>
            <Input
              label={t("businessNameLabel")}
              placeholder={t("businessNamePlaceholder")}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        ) : null}

        <div>
          <Button
            type="button"
            isLoading={isSubmitting}
            disabled={!selectedAgent}
            onClick={handleHire}
          >
            {isSubmitting
              ? t("hiringButton")
              : t("hireButton", { name: selectedAgent?.displayName ?? "" })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
