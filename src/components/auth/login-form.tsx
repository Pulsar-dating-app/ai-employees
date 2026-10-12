"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locales";
import { localizeHref } from "@/i18n/routing";
import { login, type AuthState } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const INITIAL: AuthState = { error: null };

export function LoginForm() {
  const t = useTranslations("Auth.login");
  const locale = useLocale() as Locale;
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
      <div className="flex flex-col gap-1.5">
        <Input
          label={t("passwordLabel")}
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <Link
          href={localizeHref(locale, "/?auth=forgot-password")}
          replace
          className="self-end text-xs font-medium text-primary hover:underline"
        >
          {t("forgotPasswordLink")}
        </Link>
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
