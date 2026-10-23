"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { signUp, type AuthState } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const INITIAL: AuthState = { error: null };

export function SignUpForm({
  quiz,
  submitLabel,
  submitNote,
  onSubmitAttempt,
  onCheckEmail,
}: {
  quiz?: string;
  submitLabel?: string;
  submitNote?: string;
  onSubmitAttempt?: () => void;
  onCheckEmail?: () => void;
} = {}) {
  const t = useTranslations("Auth.signUp");
  const [state, formAction, pending] = useActionState(signUp, INITIAL);

  useEffect(() => {
    if (state.checkEmail) onCheckEmail?.();
  }, [state.checkEmail, onCheckEmail]);

  if (state.checkEmail) {
    return (
      <p className="rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
        {t("checkEmail")}
      </p>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmitAttempt} className="flex flex-col gap-4">
      {quiz ? <input type="hidden" name="quiz" value={quiz} /> : null}
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

      <div className="flex flex-col gap-2">
        <Button type="submit" isLoading={pending} className="w-full">
          {submitLabel ?? t("submit")}
        </Button>
        {submitNote ? <p className="text-center text-xs text-on-surface-variant">{submitNote}</p> : null}
      </div>
    </form>
  );
}
