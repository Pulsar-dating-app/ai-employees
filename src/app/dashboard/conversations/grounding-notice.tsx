"use client";

import { useTranslations } from "next-intl";
import clsx from "clsx";
import { BadgeCheckIcon, ClockIcon } from "@/components/ui/icons";
import type { StoredGrounding } from "@/lib/chat/grounding";

export function GroundingNotice({ grounding }: { grounding: StoredGrounding }) {
  const t = useTranslations("Conversations.detail.grounding");

  // A grounded reply that quoted no figure had nothing to verify, so it gets
  // no marker -- a badge on every "olá, posso ajudar?" would be noise and,
  // worse, would claim a check that never happened.
  if (grounding.status === "grounded") {
    if (grounding.claims === 0) return null;
    return (
      <div className="ml-1 flex items-center gap-1.5 px-1">
        <BadgeCheckIcon className="h-3.5 w-3.5 shrink-0 text-tertiary" />
        <span className="text-xs text-on-surface-variant">
          {t("verified", { count: grounding.claims })}
        </span>
      </div>
    );
  }

  const isBlocked = grounding.status === "blocked";
  const Icon = isBlocked ? ClockIcon : BadgeCheckIcon;
  const quoted = grounding.violations.map((v) => v.text).filter(Boolean);

  return (
    <div
      className={clsx(
        "ml-1 flex items-start gap-2 rounded-lg px-3 py-2",
        isBlocked ? "bg-primary-fixed" : "bg-surface-container-high",
      )}
    >
      <Icon
        className={clsx("mt-0.5 h-3.5 w-3.5 shrink-0", isBlocked ? "text-primary" : "text-on-surface-variant")}
      />
      <div className="flex flex-col gap-0.5">
        <span
          className={clsx(
            "text-xs font-semibold",
            isBlocked ? "text-on-surface" : "text-on-surface-variant",
          )}
        >
          {isBlocked ? t("blockedTitle") : t("regeneratedTitle")}
        </span>
        <span className="text-xs text-on-surface-variant">
          {isBlocked ? t("blockedBody") : t("regeneratedBody")}
        </span>
        {quoted.length > 0 ? (
          <span className="text-xs text-on-surface-variant">
            {t("discarded", { figures: quoted.join(", ") })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
