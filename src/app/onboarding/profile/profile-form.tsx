"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveProfileName, type ProfileState } from "@/lib/users/actions";
import { OnboardingLoader } from "../onboarding-loader";

const INITIAL: ProfileState = { error: null };

// Same field and button treatment as the company step (onboarding-form.tsx).
export function ProfileForm() {
  const t = useTranslations("Onboarding.profile");
  const tOnboarding = useTranslations("Onboarding");
  const [state, formAction, pending] = useActionState(saveProfileName, INITIAL);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="profile-name" className="text-label-md font-semibold text-on-surface">
          {t("nameLabel")}
        </label>
        <input
          id="profile-name"
          name="name"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          autoFocus
          placeholder={t("namePlaceholder")}
          className="h-11 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-md text-on-surface transition-all duration-200 placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-label-md font-semibold text-on-primary shadow-md transition-colors duration-200 hover:bg-primary-container hover:text-on-primary-container disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? <OnboardingLoader /> : null}
        {tOnboarding("continue")}
      </button>
    </form>
  );
}
