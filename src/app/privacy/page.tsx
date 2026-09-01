import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return { title: `${t("privacy.title")} · Staffra` };
}

export default function PrivacyPage() {
  return <LegalDocument doc="privacy" />;
}
