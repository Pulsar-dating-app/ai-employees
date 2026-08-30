import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { ChatWidget } from "./chat-widget";

// Trello M4 -- the standalone hosted chat page a merchant links to instead
// of a WhatsApp number (bio, email signature, a QR code on a receipt).
// Public and unauthenticated, so it uses the service-role client and treats
// the slugs as untrusted lookup keys only -- same precedent as
// /c/[trackingId] (Trello E1) and the M3 chat API this page calls into.
//
// The lookup mirrors resolveCompanyAndAgent() in
// src/app/api/chat/[companySlug]/[agentSlug]/route.ts (not imported --
// that helper returns NextResponse, the wrong shape for a Server
// Component). Company/agent not found, or never hired at all, is a real
// 404 -- a broken/wrong link. Hired-but-paused gets a softer inline
// "unavailable" state instead, since a pause is plausibly temporary.
type ResolvedChat =
  | { kind: "not-found" }
  | { kind: "unavailable"; companyName: string }
  | {
      kind: "active";
      companyName: string;
      agentName: string;
      agentPhotoSrc: string | null;
    };

async function resolveChat(companySlug: string, agentSlug: string): Promise<ResolvedChat> {
  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("slug", companySlug)
    .maybeSingle();
  if (!company) return { kind: "not-found" };
  const companyName = company.name ?? companySlug;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, slug")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!agent) return { kind: "not-found" };

  const { data: companyAgent } = await supabase
    .from("company_agents")
    .select("status, name")
    .eq("company_id", company.id)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (!companyAgent) return { kind: "not-found" };

  if (companyAgent.status !== "active") {
    return { kind: "unavailable", companyName };
  }

  return {
    kind: "active",
    companyName,
    agentName: companyAgent.name ?? defaultAgentName(agent.slug),
    agentPhotoSrc: agentPhoto(agent.slug),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companySlug: string; agentSlug: string }>;
}): Promise<Metadata> {
  const { companySlug, agentSlug } = await params;
  const resolved = await resolveChat(companySlug, agentSlug);
  if (resolved.kind === "not-found") return { title: "Sidde" };

  const name = resolved.kind === "active" ? resolved.agentName : defaultAgentName(agentSlug);
  return { title: `${name} · ${resolved.companyName}` };
}

export default async function TalkPage({
  params,
}: {
  params: Promise<{ companySlug: string; agentSlug: string }>;
}) {
  const { companySlug, agentSlug } = await params;
  const resolved = await resolveChat(companySlug, agentSlug);

  if (resolved.kind === "not-found") notFound();

  if (resolved.kind === "unavailable") {
    const t = await getTranslations("Chat");
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-2 bg-surface px-6 text-center">
        <h1 className="font-headline-md text-headline-md text-on-surface">{t("unavailableTitle")}</h1>
        <p className="max-w-sm text-body-md text-on-surface-variant">
          {t("unavailableBody", { companyName: resolved.companyName })}
        </p>
      </main>
    );
  }

  return (
    <ChatWidget
      companySlug={companySlug}
      agentSlug={agentSlug}
      agentName={resolved.agentName}
      agentPhotoSrc={resolved.agentPhotoSrc}
      companyName={resolved.companyName}
    />
  );
}
