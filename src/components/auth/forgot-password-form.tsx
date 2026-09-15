"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestPasswordReset } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm({ initialError }: { initialError?: string | null }) {
  const t = useTranslations("Auth.forgotPassword");
  // Seeds the very first render only (e.g. bounced back here after clicking
  // an expired/already-used reset link) -- a real submit's own result always
  // overwrites this via useActionState's normal flow.
  const [state, formAction, pending] = useActionState(requestPasswordReset, {
    error: initialError ?? null,
  });

  if (state.checkEmail) {
    return (
      <p className="rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
        {t("checkEmail")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label={t("emailLabel")}
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
      />

      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" isLoading={pending} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
