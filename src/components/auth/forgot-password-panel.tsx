"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ForgotPasswordForm } from "./forgot-password-form";
import logo from "../../../public/logo.png";

export function ForgotPasswordPanel({ initialError }: { initialError?: string | null }) {
  const t = useTranslations("Auth.forgotPassword");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 pr-8">
        <Image src={logo} alt="Staffra" className="h-9 w-auto self-start" priority />
        <h2 id="auth-modal-title" className="text-xl font-semibold text-on-surface">
          {t("title")}
        </h2>
        <p className="text-sm text-on-surface-variant">{t("subtitle")}</p>
      </div>

      <ForgotPasswordForm initialError={initialError} />

      <div className="border-t border-outline-variant pt-4">
        <Link href="/?auth=login" replace className="text-sm font-medium text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
