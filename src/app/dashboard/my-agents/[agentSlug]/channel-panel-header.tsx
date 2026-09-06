import clsx from "clsx";

// Shared header for every ChannelTabsCard panel — a branded/neutral icon
// tile, a title, and a one-line description. Before this, three panels used
// a 48px tile + `h2` while two used a tiny inline icon + `h3`, so switching
// tabs jumped between two header scales.
export function ChannelPanelHeader({
  icon,
  tileClassName,
  title,
  description,
}: {
  icon: React.ReactNode;
  // Background/foreground for the 44px tile (brand colour for a channel,
  // `bg-primary-fixed text-primary` for a non-channel panel).
  tileClassName: string;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={clsx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg shadow-sm",
          tileClassName,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-on-surface-variant">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
