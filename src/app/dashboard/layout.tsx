import { getTranslations } from "next-intl/server";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// F2-F6 all render under /dashboard and need the same brand+logout header —
// built once here rather than re-derived per ticket.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Dashboard");

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold text-neutral-900">Sidde</span>
          <form action={logout}>
            <Button type="submit" variant="secondary" size="sm">
              {t("logout")}
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
    </div>
  );
}
