import clsx from "clsx";
import { getLocale, getTranslations } from "next-intl/server";

export async function UsageRing({ used, limit }: { used: number; limit: number }) {
  const [t, locale] = await Promise.all([getTranslations("Billing"), getLocale()]);
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const over = used >= limit;
  const near = !over && pct >= 80;
  const filled = Math.min(100, Math.max(pct, used > 0 ? 1.5 : 0));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-[184px] w-[184px]">
        <svg viewBox="0 0 184 184" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="92" cy="92" r="78" fill="none" strokeWidth="14" className="stroke-surface-container-high" />
          <circle
            cx="92"
            cy="92"
            r="78"
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            className={clsx(
              "billing-ring-draw",
              used === 0 && "opacity-0",
              over ? "stroke-error" : near ? "stroke-[#e0902f]" : "stroke-primary",
            )}
            style={{ "--ring-offset": 100 - filled } as React.CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-on-surface tabular-nums">
            {new Intl.NumberFormat(locale).format(used)}
          </span>
          <span className="mt-1.5 text-[13px] tabular-nums text-on-surface-variant">{t("panel.of", { limit })}</span>
          <span className="text-[13px] text-on-surface-variant">{t("panel.replies")}</span>
        </div>
      </div>
      <span
        className={clsx(
          "rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums",
          over
            ? "bg-error-container text-on-error-container"
            : near
              ? "bg-[#fff6dc] text-[#6b4a00]"
              : "bg-primary-fixed text-primary",
        )}
      >
        {t("panel.usedPct", { pct: Math.round(pct) })}
      </span>
    </div>
  );
}
