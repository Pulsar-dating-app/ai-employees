import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/conversations/list";
import { Button } from "@/components/ui/button";
import { ChatIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { ConversationsManager } from "./conversations-manager";

const PAGE_SIZE = 20;

// Trello F5 -- same server-fetches-page-1 / client-owns-filters-and-refetch
// split as Products (products/page.tsx + products-manager.tsx).
export default async function ConversationsPage() {
  const supabase = await createClient();
  const t = await getTranslations("Conversations");

  // No explicit membership check needed here (unlike the detail page) --
  // RLS already scopes this select to companies the signed-in user is a
  // member of, and this page has no canEdit-gated UI the way Products does.
  const { data: companies } = await supabase.from("companies").select("*");
  const company = companies?.[0] ?? null;

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader icon={ChatIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <p className="text-sm text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button">{t("browseMarketplace")}</Button>
        </Link>
      </div>
    );
  }

  const result = await listConversations(supabase, company.id, { page: 1, pageSize: PAGE_SIZE });
  const { rows: conversations, total } = "error" in result ? { rows: [], total: 0 } : result;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={ChatIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <ConversationsManager
        companyId={company.id}
        initialConversations={conversations}
        initialTotal={total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
