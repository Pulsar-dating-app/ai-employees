import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";
import { PageHeader } from "./page-header";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

// Shown in place of a gated page's real content when the team member that
// page exists to serve hasn't been hired. The tab itself stays in the
// sidebar (so a merchant can see the capability exists) — clicking it lands
// here instead of the page. All copy is resolved by the calling page and
// passed in as strings, same as PageHeader.
export function LockedPage({
  icon,
  pageTitle,
  pageSubtitle,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  icon: IconComponent;
  pageTitle: string;
  pageSubtitle: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={icon} title={pageTitle} subtitle={pageSubtitle} />

      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
          <LockIcon className="h-6 w-6" />
        </span>
        <div className="flex max-w-md flex-col gap-1.5">
          <h2 className="text-headline-sm font-semibold text-on-surface">{title}</h2>
          <p className="text-body-md text-on-surface-variant">{body}</p>
        </div>
        <Link href={ctaHref}>
          <Button type="button">{ctaLabel}</Button>
        </Link>
      </div>
    </div>
  );
}
