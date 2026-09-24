import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/company-access";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  // Company-level page: owners/admins only (members get their agenda).
  await requireAdminPage();
  const { conversationId } = await params;
  redirect(`/dashboard/conversations?c=${encodeURIComponent(conversationId)}`);
}
