"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { StepActions } from "../step-card";
import { OnboardingLoader } from "../onboarding-loader";

export type HireableAgent = {
  slug: string;
  name: string;
  photo: string | null;
};

// The merchant picks how their business works, not an agent: "I sell
// services by appointment" or "I sell products", each with the kinds of
// business it fits. That answer decides who is hired, the same way the
// /comecar quiz does, and the agent shows up as who will answer customers.
// Nothing is pre-selected by guesswork or row order; the one exception is a
// quiz answer reaching this step (normally the quiz skips it entirely).
export function HirePicker({
  companyId,
  agents,
  initialSlug,
}: {
  companyId: string;
  agents: HireableAgent[];
  initialSlug?: string | null;
}) {
  const t = useTranslations("Onboarding.hire");
  const router = useRouter();

  // Nothing is pre-selected by guesswork or row order -- that is the
  // recommendation this flow refuses. The one exception is a merchant who
  // already told us their business in the /comecar quiz: starting on that
  // answer is their choice, not ours.
  const [selected, setSelected] = useState<string>(
    initialSlug && agents.some((a) => a.slug === initialSlug) ? initialSlug : "",
  );
  const [isHiring, setIsHiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roving tabindex: a radiogroup is one tab stop, and arrows move the choice.
  function moveSelection(from: number, delta: number) {
    const next = (from + delta + agents.length) % agents.length;
    setSelected(agents[next].slug);
    document.getElementById(`hire-option-${agents[next].slug}`)?.focus();
  }

  async function handleHire() {
    if (!selected || isHiring) return;
    setError(null);
    setIsHiring(true);

    const res = await fetch(`/api/companies/${companyId}/agents/${selected}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      setIsHiring(false);
      setError(res.status === 402 ? t("errorPlan") : t("error"));
      return;
    }

    router.push("/onboarding/setup");
  }

  return (
    <div className="flex flex-col gap-7">
      <div role="radiogroup" aria-label={t("groupLabel")} className="grid gap-3 sm:grid-cols-2">
        {agents.map((agent, index) => {
          const active = agent.slug === selected;
          const tabbable = selected ? active : index === 0;
          return (
            <button
              key={agent.slug}
              id={`hire-option-${agent.slug}`}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={tabbable ? 0 : -1}
              disabled={isHiring}
              onClick={() => setSelected(agent.slug)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  moveSelection(index, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  moveSelection(index, -1);
                }
              }}
              className={clsx(
                "relative flex flex-col items-start gap-4 rounded-lg border p-5 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                "disabled:cursor-not-allowed disabled:opacity-70",
                active
                  ? "border-primary bg-primary-fixed/45 shadow-[0_8px_24px_-12px_rgba(53,37,205,0.45)]"
                  : "border-primary-fixed bg-white/70 hover:border-primary/40 hover:bg-white",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200",
                  active ? "scale-100 bg-primary text-on-primary opacity-100" : "scale-75 bg-transparent opacity-0",
                )}
              >
                <CheckIcon className="h-3 w-3" />
              </span>

              <span className="pr-7 text-body-lg font-semibold tracking-tight text-on-surface">
                {t(`options.${agent.slug}.title`)}
              </span>

              <span className="flex w-full flex-col gap-1 rounded-md bg-white/80 px-3.5 py-3 ring-1 ring-primary-fixed">
                <span className="text-label-sm font-semibold uppercase tracking-[0.1em] text-primary">
                  {t("idealFor")}
                </span>
                <span className="text-sm leading-relaxed text-on-surface">{t(`options.${agent.slug}.ideal`)}</span>
              </span>

              <span className="mt-auto flex items-center gap-2.5">
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary-fixed ring-1 ring-primary-fixed">
                  {agent.photo ? (
                    <Image src={agent.photo} alt="" fill sizes="32px" className="object-cover object-top" />
                  ) : null}
                </span>
                <span className="text-label-md text-on-surface-variant">
                  {t("whoAnswers", { name: agent.name, role: t(`options.${agent.slug}.role`) })}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <StepActions>
        <Button
          type="button"
          isLoading={isHiring}
          loadingIndicator={<OnboardingLoader />}
          disabled={!selected}
          onClick={handleHire}
        >
          {selected ? t("cta") : t("ctaEmpty")}
        </Button>
      </StepActions>
    </div>
  );
}
