import clsx from "clsx";

export function ChannelPanelHeader({
  icon,
  tileClassName,
  title,
  description,
}: {
  icon: React.ReactNode;
  tileClassName: string;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg shadow-sm", tileClassName)}>
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-on-surface-variant">{description}</p> : null}
      </div>
    </div>
  );
}
