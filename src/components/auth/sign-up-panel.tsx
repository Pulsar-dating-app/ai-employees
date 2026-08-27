"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignUpForm } from "./sign-up-form";

export function SignUpPanel() {
  const t = useTranslations("Auth.signUp");
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

      <SignUpForm />

      <div className="flex items-center justify-between border-t border-outline-variant pt-4">
        <p className="text-sm text-on-surface-variant">
          {t("haveAccount")}{" "}
          <Link href="/?auth=login" replace className="font-medium text-primary hover:underline">
            {t("loginLink")}
          </Link>
        </p>
        <LanguageSwitcher currentLocale={locale as "en" | "pt"} />
      </div>
    </div>
  );
}
