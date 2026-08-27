type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

// Canvas page header (Stitch "Human-Centric AI"): a tinted icon tile, a
// headline-lg title, a body-lg subtitle, and an optional right-aligned
// action slot (the marketplace uses it for its search field).
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: IconComponent;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-headline-lg font-semibold tracking-tight text-on-surface">{title}</h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">{subtitle}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
