import Link from "next/link";
import { getTranslations } from "next-intl/server";
import clsx from "clsx";
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  ListIcon,
  SettingsIcon,
  UsersIcon,
  WarningIcon,
} from "@/components/ui/icons";
import type { SchedulingSetup } from "@/lib/scheduling/setup";

type RowState = "done" | "todo" | "info";

type Row = {
  key: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  label: string;
  status: string;
  state: RowState;
  href: string;
};

const SETTINGS = "/dashboard/scheduling/settings";

export async function SchedulingSetupCard({ agentName, setup }: { agentName: string; setup: SchedulingSetup }) {
  const t = await getTranslations("MyAgents.schedulingSetup");

  const required: Row[] = [
    {
      key: "hours",
      icon: ClockIcon,
      label: t("rows.hours"),
      status: setup.openDays > 0 ? t("status.hoursOpen", { count: setup.openDays }) : t("status.hoursNone"),
      state: setup.openDays > 0 ? "done" : "todo",
      href: `${SETTINGS}#business-hours`,
    },
    {
      key: "services",
      icon: ListIcon,
      label: t("rows.services"),
      status:
        setup.servicesCount > 0 ? t("status.servicesCount", { count: setup.servicesCount }) : t("status.servicesNone"),
      state: setup.servicesCount > 0 ? "done" : "todo",
      href: "/dashboard/scheduling/services",
    },
    ...(setup.calendarAvailable
      ? [
          {
            key: "calendar",
            icon: CalendarIcon,
            label: t("rows.calendar"),
            status: setup.calendarConnected ? t("status.calendarConnected") : t("status.calendarNotConnected"),
            state: (setup.calendarConnected ? "done" : "todo") as RowState,
            href: `${SETTINGS}#google-calendar`,
          },
        ]
      : []),
  ];
  const info: Row[] = [
    // 2026-09-24 -- one schedule per professional.
    {
      key: "professionals",
      icon: UsersIcon,
      label: t("rows.professionals"),
      status:
        setup.professionalsCount > 1 && setup.calendarAvailable
          ? t("status.professionalsWithCalendars", {
              count: setup.professionalsCount,
              connected: setup.calendarsConnected,
            })
          : t("status.professionalsCount", { count: setup.professionalsCount }),
      state: "info",
      href: "/dashboard/scheduling/professionals",
    },
    {
      key: "approval",
      icon: SettingsIcon,
      label: t("rows.approval"),
      status: setup.requiresApproval ? t("status.approvalOn") : t("status.approvalOff"),
      state: "info",
      href: `${SETTINGS}#appointment-rules`,
    },
    {
      key: "intake",
      icon: ListIcon,
      label: t("rows.intake"),
      status: t("status.intakeCount", { count: setup.intakeCount }),
      state: "info",
      href: `${SETTINGS}#intake-questions`,
    },
  ];

  const done = required.filter((r) => r.state === "done").length;
  const total = required.length;
  const complete = done === total;
  const firstPending = required.find((r) => r.state === "todo");
  const descriptionKey = complete
    ? "descriptionReady"
    : setup.openDays === 0 || setup.servicesCount === 0
      ? "descriptionBlocked"
      : "descriptionCalendar";

  return (
    <section
      aria-labelledby="scheduling-setup-title"
      className="rounded-[28px] border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-[0_1px_2px_rgba(25,28,29,0.04)] sm:p-8"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <h2 id="scheduling-setup-title" className="text-lg font-semibold tracking-tight text-on-surface">
            {t("title", { name: agentName })}
          </h2>
          <p className="mt-0.5 max-w-[60ch] text-sm text-on-surface-variant">
            {t(descriptionKey, { name: agentName })}
          </p>
        </div>
        {complete ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-success-100 px-3.5 py-2 text-[13px] font-semibold text-success-500">
              <CheckIcon className="h-3.5 w-3.5" />
              {t("allReady")}
            </span>
            <Link
              href="/dashboard/scheduling"
              className="inline-flex h-10 items-center rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-label-md font-semibold text-on-surface transition-[border-color,color] hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("open")}
            </Link>
          </div>
        ) : firstPending ? (
          <Link
            href={firstPending.href}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t("finish")}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t("progress", { done, total })}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high"
        >
          <div
            className={clsx(
              "billing-bar-in h-full origin-left rounded-full",
              complete ? "bg-success-500" : "bg-primary",
            )}
            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          />
        </div>
        <p className="shrink-0 text-[13px] font-semibold tabular-nums text-on-surface">
          {t("progress", { done, total })}
        </p>
      </div>

      <SetupList rows={required} className="mt-5" />
      <h3 className="mt-6 text-[13px] font-semibold text-on-surface-variant">{t("rulesHeading")}</h3>
      <SetupList rows={info} className="mt-2" />
    </section>
  );
}

function SetupList({ rows, className }: { rows: Row[]; className?: string }) {
  return (
    <ul
      className={clsx("flex flex-col divide-y divide-outline-variant/40 border-y border-outline-variant/40", className)}
    >
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <li key={row.key}>
            <Link
              href={row.href}
              className="group -mx-2 flex items-center gap-4 rounded-2xl px-2 py-3.5 transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                className={clsx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  row.state === "done" && "bg-success-100 text-success-500",
                  row.state === "todo" && "bg-[#fff6dc] text-[#b07800]",
                  row.state === "info" && "bg-surface-container text-on-surface-variant",
                )}
              >
                {row.state === "done" ? (
                  <CheckIcon className="h-4 w-4" />
                ) : row.state === "todo" ? (
                  <WarningIcon className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-on-surface">{row.label}</span>
                <span
                  className={clsx(
                    "block truncate text-[13px]",
                    row.state === "todo" ? "font-medium text-[#8a5a00]" : "text-on-surface-variant",
                  )}
                >
                  {row.status}
                </span>
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-outline transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
