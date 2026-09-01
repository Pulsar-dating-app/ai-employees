import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getConversationDetail } from "@/lib/conversations/detail";
import { BackLink } from "../../back-link";
import { ConversationThread } from "./conversation-thread";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Conversations");

  const [
    {
      data: { user },
    },
    { data: companies },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("id")]);
  const company = companies?.[0] ?? null;
  if (!company || !user) notFound();

  const { data: membership } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  const result = await getConversationDetail(supabase, company.id, conversationId);
  if ("error" in result) notFound();

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard/conversations">{t("backToConversations")}</BackLink>
      <ConversationThread
        companyId={company.id}
        conversationId={conversationId}
        initialConversation={result.conversation}
        initialMessages={result.messages}
      />
    </div>
  );
}
