import { notFound } from "next/navigation";
import { isPrefixedLocale } from "@/i18n/routing";

// `/en`, `/it/privacy`, … — the non-Portuguese copies of the public pages
// (see src/i18n/routing.ts). The pages themselves are re-exports of the
// unprefixed ones; the proxy has already pinned the request locale from the
// URL, so they render in the right language without reading this param.
// Static routes (`/dashboard`, `/login`, …) always win over this dynamic
// segment, so it only ever sees unknown first segments — 404 anything that
// isn't a prefixed locale (`/pt` itself is redirected to `/` by the proxy).
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isPrefixedLocale(locale)) notFound();
  return children;
}
