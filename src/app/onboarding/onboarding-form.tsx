"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { createCompany, type OnboardingState } from "@/lib/companies/actions";
import { setLocale } from "@/lib/i18n/actions";
import { SpinnerIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/request";

const INITIAL: OnboardingState = { error: null };

// Markup follows the Stitch "Staffra Onboarding - Setup Business" screen:
// a white filled field with a visible outline that lifts to an indigo ring
// on focus, and a 44px solid-indigo submit. Not the shared <Input>/<Button>
// primitives — those carry the dashboard's filled/borderless field style;
// this standalone screen has its own.
export function OnboardingForm() {
  const t = useTranslations("Onboarding");
  const [state, formAction, pending] = useActionState(createCompany, INITIAL);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-label-md font-semibold text-on-surface">
          {t("nameLabel")}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={255}
          autoComplete="organization"
          autoFocus
          placeholder={t("namePlaceholder")}
          className="h-11 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-md text-on-surface transition-all duration-200 placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
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
        {pending ? <SpinnerIcon className="h-4 w-4" /> : null}
        {t("continue")}
      </button>
    </form>
  );
}

// The Stitch "EN | PT" footer — a real locale switch (cookie + refresh),
// styled as the design draws it rather than reusing the dashboard's pill.
export function LocaleToggle({ currentLocale }: { currentLocale: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === currentLocale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      className={clsx(
        "flex items-center gap-2 text-label-sm font-semibold transition-opacity",
        isPending && "opacity-60",
      )}
    >
      {(["en", "pt"] as const).map((loc, i) => (
        <span key={loc} className="flex items-center gap-2">
          {i > 0 ? <span className="h-4 w-px bg-outline-variant" /> : null}
          <button
            type="button"
            onClick={() => pick(loc)}
            aria-pressed={loc === currentLocale}
            className={clsx(
              "uppercase tracking-wide transition-colors hover:text-primary",
              loc === currentLocale ? "text-on-surface-variant" : "text-outline-variant",
            )}
          >
            {loc}
          </button>
        </span>
      ))}
    </div>
  );
}
