import clsx from "clsx";
import { getLocale, getTranslations } from "next-intl/server";
import { intlTag } from "@/i18n/locales";
import { WhatsAppIcon } from "@/components/ui/icons";
import { META_SPEND_ALERT_LEVELS, type MetaSpend } from "@/lib/whatsapp/meta-pricing";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export async function MetaSpendCard({ spend, className }: { spend: MetaSpend; className?: string }) {
  const [t, locale] = await Promise.all([getTranslations("Billing.metaSpend"), getLocale()]);
  const count = new Intl.NumberFormat(intlTag(locale));
  const pct = spend.ceilingCents > 0 ? Math.min(100, (spend.spentCents / spend.ceilingCents) * 100) : 0;
  const tone =
    spend.alertLevel === 100 ? "error" : spend.alertLevel === 80 ? "warn" : spend.alertLevel === 50 ? "notice" : null;

  return (
    <section id="meta-spend" className={clsx("flex flex-col gap-6 p-6 sm:p-8", className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white">
          <WhatsAppIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-body-lg font-semibold text-on-surface">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">{t("subtitle")}</p>
        </div>
      </div>

      {tone ? (
        <p
          role="status"
          className={clsx(
            "rounded-xl px-4 py-3 text-sm font-medium",
            tone === "error" && "bg-error-container/60 text-error",
            tone === "warn" && "bg-[#fdf1e0] text-[#8a5300]",
            tone === "notice" && "bg-primary-fixed/60 text-primary",
          )}
        >
          {t(`alert${spend.alertLevel}`, { ceiling: BRL.format(spend.ceilingCents / 100) })}
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-surface-container-low p-4">
          <dt className="text-[13px] font-medium text-on-surface-variant">{t("spent")}</dt>
          <dd className="mt-1 text-[26px] font-semibold tabular-nums text-on-surface">
            {BRL.format(spend.spentCents / 100)}
          </dd>
        </div>
        <div className="rounded-2xl bg-surface-container-low p-4">
          <dt className="text-[13px] font-medium text-on-surface-variant">{t("projected")}</dt>
          <dd className="mt-1 text-[26px] font-semibold tabular-nums text-on-surface">
            {BRL.format(spend.projectedCents / 100)}
          </dd>
        </div>
        <div className="rounded-2xl bg-surface-container-low p-4">
          <dt className="text-[13px] font-medium text-on-surface-variant">{t("freeLeft")}</dt>
          <dd className="mt-1 text-[26px] font-semibold tabular-nums text-on-surface">
            {t("freeLeftValue", {
              left: count.format(spend.freeRepliesLeft),
              total: count.format(spend.freeRepliesTotal),
            })}
          </dd>
        </div>
      </dl>

      <div>
        <div className="flex items-baseline justify-between gap-3 text-[13px] text-on-surface-variant">
          <span>{t("ceilingLabel")}</span>
          <span className="font-semibold tabular-nums text-on-surface">{BRL.format(spend.ceilingCents / 100)}</span>
        </div>
        <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className={clsx(
              "h-full rounded-full transition-[width] duration-500",
              tone === "error" ? "bg-error" : tone === "warn" ? "bg-[#e0902f]" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
          {META_SPEND_ALERT_LEVELS.slice(0, 2).map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className="absolute top-0 h-full w-px bg-on-surface/20"
              style={{ left: `${level}%` }}
            />
          ))}
        </div>
      </div>

      <p className="text-[12px] leading-[18px] text-on-surface-variant">{t("footnote")}</p>
    </section>
  );
}
