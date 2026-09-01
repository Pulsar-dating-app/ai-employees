"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createCompany, type OnboardingState } from "@/lib/companies/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const INITIAL: OnboardingState = { error: null };

export function OnboardingForm() {
  const t = useTranslations("Onboarding");
  const [state, formAction, pending] = useActionState(createCompany, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label={t("nameLabel")}
        id="name"
        name="name"
        required
        maxLength={255}
        autoComplete="organization"
        autoFocus
        placeholder={t("namePlaceholder")}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" isLoading={pending} className="w-full">
        {t("continue")}
      </Button>
    </form>
  );
}
