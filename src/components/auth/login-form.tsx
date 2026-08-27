"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type AuthState } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const INITIAL: AuthState = { error: null };

export function LoginForm() {
  const t = useTranslations("Auth.login");
  const [state, formAction, pending] = useActionState(login, INITIAL);

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
      <Input
        label={t("passwordLabel")}
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
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
