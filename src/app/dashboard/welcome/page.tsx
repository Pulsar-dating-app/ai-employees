import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/company-access";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";
import {
  CalendarIcon,
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  InstagramIcon,
  PackageIcon,
  SettingsIcon,
  UserIcon,
} from "@/components/ui/icons";

type HireRow = {
  agent_id: string;
  name: string | null;
  photo_type: string | null;
  photo_asset_url: string | null;
  agents: { slug: string } | null;
};

export default async function WelcomePage() {
  const { company } = await requireAdminPage();
  if (!company) redirect("/dashboard");

  const supabase = await createClient();
  const [t, { data: hires }, { data: instagram }] = await Promise.all([
    getTranslations("Welcome"),
    supabase
      .from("company_agents")
      .select("agent_id, name, photo_type, photo_asset_url, agents(slug)")
      .eq("company_id", company.id),
    supabase
      .from("company_instagram_connections")
      .select("agent_id, username")
      .eq("company_id", company.id)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = (hires as unknown as HireRow[] | null) ?? [];
  const connection = instagram as { agent_id: string; username: string | null } | null;
  const hire = rows.find((row) => row.agent_id === connection?.agent_id) ?? rows[0];
  const slug = hire?.agents?.slug;
  if (!hire || !slug) redirect("/dashboard");

  const name = hire.name ?? defaultAgentName(slug);
  const photo = resolveAgentPhoto(slug, hire.photo_type, hire.photo_asset_url);
  const scheduling = slug === "ana";
  const username = connection?.username ?? null;

  const places = [
    {
      href: "/dashboard/conversations",
      icon: <ChatIcon className="h-5 w-5" />,
      title: t("places.conversations.title"),
      body: t("places.conversations.body", { name }),
    },
    scheduling
      ? {
          href: "/dashboard/scheduling",
          icon: <CalendarIcon className="h-5 w-5" />,
          title: t("places.scheduling.title"),
          body: t("places.scheduling.body", { name }),
        }
      : {
          href: "/dashboard/products",
          icon: <PackageIcon className="h-5 w-5" />,
          title: t("places.products.title"),
          body: t("places.products.body", { name }),
        },
    {
      href: `/dashboard/my-agents/${slug}`,
      icon: <UserIcon className="h-5 w-5" />,
      title: name,
      body: t("places.agent.body"),
    },
    {
      href: "/dashboard/settings",
      icon: <SettingsIcon className="h-5 w-5" />,
      title: t("places.settings.title"),
      body: t("places.settings.body", { name }),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <section className="flex flex-col items-center gap-4 rounded-3xl border-2 border-primary/40 bg-surface-container-lowest px-5 py-7 text-center shadow-[0_18px_40px_-24px_rgba(53,37,205,0.45)] sm:px-8">
        <span className="relative">
          {photo ? (
            <span className="relative block h-20 w-20 overflow-hidden rounded-full bg-primary-fixed ring-4 ring-primary-fixed">
              <Image src={photo} alt={name} fill sizes="80px" className="object-cover object-top" priority />
            </span>
          ) : null}
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#1f9d55] text-white ring-4 ring-surface-container-lowest">
            <CheckIcon className="h-4 w-4" />
          </span>
        </span>
        <h1 className="text-headline-md font-semibold tracking-tight text-on-surface">{t("title", { name })}</h1>
        <p className="max-w-md text-body-md text-on-surface-variant">
          {t(scheduling ? "bodyScheduling" : "bodySales", { name })}
        </p>
        {username ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-fixed/50 px-3 py-1.5 text-sm font-semibold text-on-surface">
            <InstagramIcon className="h-4 w-4 text-[#d62976]" />@{username}
          </span>
        ) : null}
      </section>

      <section className="flex flex-col gap-1.5 rounded-2xl bg-primary-fixed/35 p-4 sm:p-5">
        <h2 className="text-body-lg font-semibold text-on-surface">{t("test.title")}</h2>
        <p className="text-sm text-on-surface-variant">{t("test.body", { name })}</p>
      </section>

      <section aria-labelledby="welcome-places" className="flex flex-col gap-3">
        <div>
          <h2 id="welcome-places" className="text-body-lg font-semibold text-on-surface">
            {t("places.title")}
          </h2>
          <p className="text-sm text-on-surface-variant">{t("places.subtitle")}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {places.map((place) => (
            <li key={place.href}>
              <Link
                href={place.href}
                className="group flex items-center gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-4 transition-colors hover:border-primary/30 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">
                  {place.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-on-surface">{place.title}</span>
                  <span className="text-[13px] leading-5 text-on-surface-variant">{place.body}</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-outline transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/dashboard"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter] duration-150 hover:brightness-110 sm:mx-auto sm:w-auto"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
