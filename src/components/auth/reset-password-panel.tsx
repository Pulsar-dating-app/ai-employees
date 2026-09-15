"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ResetPasswordForm } from "./reset-password-form";
import logo from "../../../public/logo.png";

export function ResetPasswordPanel() {
  const t = useTranslations("Auth.resetPassword");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 pr-8">
        <Image src={logo} alt="Staffra" className="h-9 w-auto self-start" priority />
        <h2 id="auth-modal-title" className="text-xl font-semibold text-on-surface">
          {t("title")}
        </h2>
        <p className="text-sm text-on-surface-variant">{t("subtitle")}</p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
