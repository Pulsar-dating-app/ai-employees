import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { login } from "@/lib/auth/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("Auth.login");
  const locale = await getLocale();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div className="fixed right-4 top-4">
        <LanguageSwitcher currentLocale={locale as "en" | "pt"} />
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{t("title")}</h1>
        <p className="text-sm text-neutral-500">{t("subtitle")}</p>
      </div>

      <Card>
        <form action={login} className="flex flex-col gap-4">
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

      <p className="text-sm text-neutral-500">
        {t("noAccount")}{" "}
        <Link href="/sign-up" className="font-medium text-accent-600 underline">
          {t("signUpLink")}
        </Link>
      </p>
    </main>
  );
}
