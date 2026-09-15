import Link from "next/link";
import { BadgeCheckIcon } from "@/components/ui/icons";

export type ReliabilityCardProps = {
  title: string;
  subtitle: string;
  emptyBody: string;
  scopeNote: string;
  stats: { key: string; value: string; label: string; emphasis?: boolean }[];
  checked: number;
  cta?: { href: string; label: string };
};

export function ReliabilityCard({
  title,
  subtitle,
  emptyBody,
  scopeNote,
  stats,
  checked,
  cta,
}: ReliabilityCardProps) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-level1">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
          <BadgeCheckIcon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-headline-md font-semibold tracking-tight text-on-surface">{title}</h3>
          <p className="mt-1 max-w-xl text-body-md text-on-surface-variant">{subtitle}</p>
        </div>
      </div>

      {checked === 0 ? (
        <p className="text-sm text-on-surface-variant">{emptyBody}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.key}
                className="flex flex-col gap-1 rounded-lg border border-outline-variant/60 bg-surface-container-low px-4 py-3"
              >
                <dt className="text-xs text-on-surface-variant">{stat.label}</dt>
                <dd
                  className={
                    stat.emphasis
                      ? "text-2xl font-semibold tracking-tight text-primary"
                      : "text-2xl font-semibold tracking-tight text-on-surface"
                  }
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          {cta ? (
            <Link href={cta.href} className="text-sm font-semibold text-primary hover:underline">
              {cta.label}
            </Link>
          ) : null}
        </>
      )}

      <p className="text-xs text-on-surface-variant">{scopeNote}</p>
    </div>
  );
}
