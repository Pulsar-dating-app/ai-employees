type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

// Reused by every top-level tab (Marketplace/My Team/Settings) so the same
// icon that marks a destination in the sidebar reappears at the top of its
// page — one consistent system instead of three ad hoc headers.
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: IconComponent;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        <p className="text-sm text-neutral-500">{subtitle}</p>
      </div>
    </div>
  );
}
