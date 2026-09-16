"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { StepActions } from "../step-card";

export type HireableAgent = {
  slug: string;
  name: string;
  role: string;
  blurb: string;
  photo: string | null;
};

// Deliberately a choice, never a recommendation. A classifier guessing the
// merchant's business at the moment of highest expectation costs more when it
// is wrong than it saves when it is right -- and picking who you hire is the
// one moment in this flow where the "employee, not software" framing is
// actually exercised.
export function HirePicker({ companyId, agents }: { companyId: string; agents: HireableAgent[] }) {
  const t = useTranslations("Onboarding.hire");
  const router = useRouter();

  // Nothing is pre-selected on purpose. Arriving with a hire already chosen is
  // the recommendation this flow refuses, just made silently by row order.
  const [selected, setSelected] = useState<string>("");
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
                "group relative flex flex-col items-start gap-3 rounded-lg border p-5 text-left transition-all duration-200",
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
                  active
                    ? "scale-100 bg-primary text-on-primary opacity-100"
                    : "scale-75 bg-transparent opacity-0",
                )}
              >
                <CheckIcon className="h-3 w-3" />
              </span>

              <span className="relative h-16 w-16 overflow-hidden rounded-full bg-primary-fixed ring-1 ring-primary-fixed">
                {agent.photo ? (
                  <Image
                    src={agent.photo}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover object-top"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-headline-md font-semibold text-primary">
                    {agent.name.charAt(0)}
                  </span>
                )}
              </span>

              <span className="flex flex-col gap-0.5">
                <span className="text-body-lg font-semibold tracking-tight text-on-surface">
                  {agent.name}
                </span>
                <span className="text-label-sm font-semibold uppercase tracking-[0.1em] text-primary">
                  {agent.role}
                </span>
              </span>

              <span className="text-sm leading-relaxed text-on-surface-variant">{agent.blurb}</span>
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
        <Button type="button" isLoading={isHiring} disabled={!selected} onClick={handleHire}>
          {selected
            ? t("cta", { name: agents.find((a) => a.slug === selected)?.name ?? "" })
            : t("ctaEmpty")}
        </Button>
      </StepActions>
    </div>
  );
}
