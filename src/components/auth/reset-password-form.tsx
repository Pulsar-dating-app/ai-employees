"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resetPassword, type AuthState } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const INITIAL: AuthState = { error: null };

export function ResetPasswordForm() {
  const t = useTranslations("Auth.resetPassword");
  const [state, formAction, pending] = useActionState(resetPassword, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
