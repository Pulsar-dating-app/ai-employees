import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signUp } from "@/lib/auth/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkEmail?: string }>;
}) {
  const { error, checkEmail } = await searchParams;
  const t = await getTranslations("Auth.signUp");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{t("title")}</h1>
        <p className="text-sm text-neutral-500">{t("subtitle")}</p>
      </div>

      {checkEmail ? (
        <Card>
          <p className="text-sm text-neutral-700">{t("checkEmail")}</p>
        </Card>
      ) : (
        <Card>
          <form action={signUp} className="flex flex-col gap-4">
            <Input
              label={t("emailLabel")}
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
            <div className="flex flex-col gap-1">
              <Input
                label={t("passwordLabel")}
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
              />
              <p className="text-xs text-neutral-400">{t("passwordHint")}</p>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary">
              {t("submit")}
            </Button>
          </form>
        </Card>
      )}

      <p className="text-sm text-neutral-500">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-accent-600 underline">
          {t("loginLink")}
        </Link>
      </p>
    </main>
  );
}
