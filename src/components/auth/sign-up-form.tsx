"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signUp, type AuthState } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const INITIAL: AuthState = { error: null };

export function SignUpForm() {
  const t = useTranslations("Auth.signUp");
  const [state, formAction, pending] = useActionState(signUp, INITIAL);

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
      <div className="flex flex-col gap-1.5">
        <Input
          label={t("passwordLabel")}
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
        <p className="text-xs text-outline">{t("passwordHint")}</p>
      </div>

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
