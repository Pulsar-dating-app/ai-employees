import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirectTargetFor, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { StepCard } from "../step-card";
import { ProofChat } from "./proof-chat";

// Step 4: she does the job, on the merchant's own data, before a single
// channel is connected. The suggestions are seeded from a real row they
// imported minutes ago -- a generic "ask me anything" would prove nothing,
// and seeing their own product name in the chip is the whole moment.
export default async function OnboardingReadyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = await resolveOnboardingState(supabase);
  const back = redirectTargetFor(state, "ready");
  if (back) redirect(back);

  const slug = state.agentSlug!;
  const name = state.agentName ?? defaultAgentName(slug);
  const isScheduling = slug === "ana";

  const [t, sample] = await Promise.all([
    getTranslations("Onboarding.ready"),
    isScheduling
      ? supabase
          .from("services")
          .select("name")
          .eq("company_id", state.companyId!)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()
      : supabase
          .from("products")
          .select("name")
          .eq("company_id", state.companyId!)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
  ]);

  const sampleName = (sample.data as { name: string } | null)?.name ?? null;

  const suggestions = isScheduling
    ? [
        sampleName ? t("suggestBook", { name: sampleName }) : t("suggestBookGeneric"),
        t("suggestHours"),
      ]
    : [
        sampleName ? t("suggestPrice", { name: sampleName }) : t("suggestPriceGeneric"),
        t("suggestBrowse"),
      ];

  return (
    <StepCard
      title={t("title", { name })}
      subtitle={t("subtitle", { name })}
      portrait={agentPhoto(slug)}
      portraitAlt={name}
    >
      <ProofChat
        companyId={state.companyId!}
        agentSlug={slug}
        agentName={name}
        portrait={agentPhoto(slug)}
        suggestions={suggestions}
      />
    </StepCard>
  );
}
