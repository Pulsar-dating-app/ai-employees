import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { ArrowRightIcon, ChatIcon, ClockIcon, BadgeCheckIcon } from "@/components/ui/icons";
import type { TeamActivity } from "@/lib/agents/team-activity";

export type TeamMember = {
  slug: string;
  name: string;
  role: string;
  description: string;
  photoSrc: string | null;
  status: "active" | "paused" | "available";
};

function Portrait({ photoSrc, name, sizes }: { photoSrc: string | null; name: string; sizes: string }) {
  return photoSrc ? (
    <Image
      src={photoSrc}
      alt={name}
      fill
      sizes={sizes}
      className="object-cover object-[center_28%] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-primary-fixed">
      <AgentAvatar role="intent" size="lg" />
    </div>
  );
}

export function TeamBadge({
  member,
  activity,
  index,
  silenced,
}: {
  member: TeamMember;
  activity: TeamActivity;
  index: number;
  silenced: boolean;
}) {
  const t = useTranslations("MyAgents.team");
  const href = `/dashboard/my-agents/${member.slug}`;
  const active = member.status === "active" && !silenced;
  const statusLabel = active ? t("answering") : member.status === "active" ? t("silenced") : t("paused");

  return (
    <article className="billing-card-in h-full" style={{ "--i": index } as React.CSSProperties}>
      <div className="group flex h-full flex-col overflow-hidden rounded-[28px] sm:flex-row border border-outline-variant/60 bg-surface-container-lowest shadow-[0_1px_2px_rgba(25,28,29,0.04),0_24px_60px_-30px_rgba(53,37,205,0.3)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(25,28,29,0.04),0_30px_70px_-28px_rgba(53,37,205,0.42)]">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="relative block aspect-[16/10] shrink-0 overflow-hidden bg-surface-container sm:aspect-auto sm:min-h-[232px] sm:w-[40%]"
        >
          <Portrait
            photoSrc={member.photoSrc}
            name={member.name}
            sizes="(min-width:1024px) 260px, (min-width:640px) 40vw, 100vw"
          />
          <span
            className={clsx(
              "absolute left-4 top-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-[0_4px_14px_-6px_rgba(25,28,29,0.35)] backdrop-blur-md",
              active
                ? "bg-surface-container-lowest/90 text-success-500"
                : member.status === "active"
                  ? "bg-surface-container-lowest/90 text-error"
                  : "bg-surface-container-lowest/90 text-on-surface-variant",
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                "h-2 w-2 rounded-full",
                active ? "inbox-live-dot bg-success-500" : member.status === "active" ? "bg-error" : "bg-outline",
              )}
            />
            {statusLabel}
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
          <div className="min-w-0">
            <h3 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-on-surface">
              {member.name}
            </h3>
            <p className="mt-0.5 text-sm font-medium text-primary">{member.role}</p>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-outline-variant/50 pt-4">
            <p className="flex items-center gap-3 text-sm text-on-surface-variant">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
                <ChatIcon className="h-4 w-4" />
              </span>
              <span>
                <span className="mr-1 text-base font-semibold tabular-nums text-on-surface">
                  {activity.conversations}
                </span>
                {t("conversations", { count: activity.conversations })}
              </span>
            </p>
            {activity.needsYou > 0 ? (
              <Link
                href="/dashboard/conversations"
                className="flex items-center gap-3 rounded-full text-sm font-semibold text-primary transition-colors hover:text-primary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                  <ClockIcon className="h-4 w-4" />
                </span>
                {t("needsYou", { count: activity.needsYou })}
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="flex items-center gap-3 text-sm text-on-surface-variant">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-500">
                  <BadgeCheckIcon className="h-4 w-4" />
                </span>
                {t("allClear")}
              </p>
            )}
          </div>

          <div className="h-5 shrink-0" />

          <Link
            href={href}
            className="group/cta mt-auto inline-flex h-10 items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-label-md font-semibold text-on-surface transition-[border-color,color] duration-150 hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t("manage", { name: member.name })}
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function firstSentences(text: string, maxLength: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let result = "";
  for (const sentence of sentences) {
    const next = (result + sentence).trim();
    if (result && next.length > maxLength) break;
    result = next + " ";
  }
  return result.trim();
}

export function HireCard({
  member,
  billingActive,
  pastDue,
  index,
}: {
  member: TeamMember;
  billingActive: boolean;
  pastDue: boolean;
  index: number;
}) {
  const t = useTranslations("MyAgents");
  const href = `/dashboard/agents/${member.slug}`;

  return (
    <Link
      href={href}
      style={{ "--i": index } as React.CSSProperties}
      className="billing-card-in group flex flex-col gap-5 rounded-[24px] border border-outline-variant/60 bg-surface-container-low p-4 transition-[border-color,background-color] duration-200 hover:border-primary/30 hover:bg-surface-container-lowest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:gap-5 sm:px-5 sm:py-4"
    >
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-surface-container">
          <Portrait photoSrc={member.photoSrc} name={member.name} sizes="64px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold text-on-surface">{member.name}</h3>
            <p className="text-sm font-medium text-primary">{member.role}</p>
          </div>
          {member.description ? (
            <p className="mt-1.5 text-sm leading-6 text-on-surface-variant">
              {firstSentences(member.description, 200)}
            </p>
          ) : null}
          <p className="mt-2 text-[12px] font-semibold text-on-surface-variant">
            {pastDue ? t("team.billingIssue") : billingActive ? t("includedInPlan") : t("needsPlan")}
          </p>
        </div>
      </div>
      <span className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter] duration-150 group-hover:brightness-110">
        {t("team.hireCta", { name: member.name })}
        <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
