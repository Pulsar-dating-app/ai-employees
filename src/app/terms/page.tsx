import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return { title: `${t("terms.title")} · Staffra` };
}

export default function TermsPage() {
  return <LegalDocument doc="terms" />;
}
