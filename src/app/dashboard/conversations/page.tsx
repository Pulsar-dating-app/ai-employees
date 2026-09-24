import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/conversations/list";
import { getConversationDetail } from "@/lib/conversations/detail";
import { findUnconfirmedConversationIds } from "@/lib/conversations/pending";
import { Button } from "@/components/ui/button";
import { ChatIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { ConversationsInbox } from "./conversations-inbox";
import { requireAdminPage } from "@/lib/auth/company-access";

const PAGE_SIZE = 30;

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  // Company-level page: owners/admins only (members get their agenda).
  await requireAdminPage();
  const supabase = await createClient();
  const [t, { c }, { data: companies }] = await Promise.all([
    getTranslations("Conversations"),
    searchParams,
    supabase.from("companies").select("*"),
  ]);
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

  const selectedId = typeof c === "string" && c ? c : null;

  const [result, pendingIds, selected] = await Promise.all([
    listConversations(supabase, company.id, { page: 1, pageSize: PAGE_SIZE }),
    findUnconfirmedConversationIds(supabase, company.id),
    selectedId ? getConversationDetail(supabase, company.id, selectedId) : Promise.resolve(null),
  ]);
  const { rows: conversations, total } = "error" in result ? { rows: [], total: 0 } : result;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-headline-md font-semibold tracking-tight text-on-surface sm:sr-only">{t("pageTitle")}</h1>

      <ConversationsInbox
        companyId={company.id}
        initialRows={conversations}
        initialTotal={total}
        initialPendingTotal={pendingIds.length}
        initialSelected={selected && !("error" in selected) ? selected : null}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
