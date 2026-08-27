"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "./login-form";

export function LoginPanel() {
  const t = useTranslations("Auth.login");
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 pr-8">
        <span className="text-sm font-bold tracking-tight text-primary">Sidde</span>
        <h2 id="auth-modal-title" className="text-xl font-semibold text-on-surface">
          {t("title")}
        </h2>
        <p className="text-sm text-on-surface-variant">{t("subtitle")}</p>
      </div>

      <LoginForm />

      <div className="flex items-center justify-between border-t border-outline-variant pt-4">
        <p className="text-sm text-on-surface-variant">
          {t("noAccount")}{" "}
          <Link href="/?auth=signup" replace className="font-medium text-primary hover:underline">
            {t("signUpLink")}
          </Link>
        </p>
        <LanguageSwitcher currentLocale={locale as "en" | "pt"} />
      </div>
    </div>
  );
}
