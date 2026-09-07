import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  // Root layout's title template appends " · Staffra".
  return { title: t("terms.title") };
}

export default function TermsPage() {
  return <LegalDocument doc="terms" />;
}
