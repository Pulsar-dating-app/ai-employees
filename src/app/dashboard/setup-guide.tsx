"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { CheckIcon, ChevronRightIcon } from "@/components/ui/icons";
import { SideDrawer } from "@/components/ui/side-drawer";
import type { SetupStep } from "@/lib/setup/checklist";

export function SetupGuide({ steps, variant }: { steps: SetupStep[]; variant: "rail" | "sheet" }) {
  const t = useTranslations("Dashboard.setup");
  const [open, setOpen] = useState(false);
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (total === 0 || done === total) return null;
  const next = steps.find((s) => !s.done);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={clsx(
          "group flex flex-col gap-2 rounded-2xl border border-primary/15 bg-primary-fixed/40 px-3.5 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary-fixed/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          variant === "rail" ? "mx-3 mb-3" : "w-full",
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-on-surface">{t("entry")}</span>
          <span className="text-[12px] font-semibold tabular-nums text-primary">{t("progress", { done, total })}</span>
        </span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-container-lowest">
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </span>
        {next ? (
          <span className="flex items-start gap-1 text-[12px] leading-4 text-on-surface-variant">
            <span className="line-clamp-2">{t("next", { step: t(`steps.${next.key}.title`) })}</span>
            <ChevronRightIcon className="mt-0.5 h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </span>
        ) : null}
      </button>

      <SideDrawer open={open} title={t("title")} closeLabel={t("close")} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-on-surface-variant">{t("description")}</p>
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-label={t("progress", { done, total })}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
              </div>
              <p className="shrink-0 text-[13px] font-semibold tabular-nums text-on-surface">
                {t("progress", { done, total })}
              </p>
            </div>
          </div>
          <ol className="flex flex-col gap-2">
            {steps.map((step, i) => {
              const isNext = step === next;
              return (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "group flex items-start gap-4 rounded-2xl border p-4 transition-[border-color,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                      isNext
                        ? "border-primary/30 bg-primary-fixed/30 hover:border-primary/50"
                        : "border-outline-variant/60 hover:border-primary/30 hover:bg-surface-container-low",
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                        step.done
                          ? "bg-success-100 text-success-500"
                          : isNext
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container text-on-surface-variant",
                      )}
                    >
                      {step.done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          "block text-sm font-semibold",
                          step.done ? "text-on-surface-variant line-through decoration-outline/60" : "text-on-surface",
                        )}
                      >
                        {t(`steps.${step.key}.title`)}
                      </span>
                      {!step.done ? (
                        <span className="mt-0.5 block text-[13px] leading-5 text-on-surface-variant">
                          {t(`steps.${step.key}.body`)}
                        </span>
                      ) : (
                        <span className="sr-only">{t("doneLabel")}</span>
                      )}
                    </span>
                    <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-outline transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </SideDrawer>
    </>
  );
}
