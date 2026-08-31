import clsx from "clsx";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

// Trello K3 — the card chrome shared by the Business Hours and Appointment
// Controls sections of the Stitch "Scheduling Settings" screen: lighter
// hairline than the app's <Card> (matching K4's scheduling screens), a
// tinted round icon tile, a headline-md title + label-md subtitle, and a
// divider under the header.
export function SettingsSection({
  icon: Icon,
  iconTone = "primary",
  title,
  subtitle,
  children,
}: {
  icon: IconComponent;
  iconTone?: "primary" | "secondary";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-level1">
      <div className="mb-5 flex items-center gap-3 border-b border-outline-variant/40 pb-4">
        <span
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            iconTone === "primary"
              ? "bg-primary/10 text-primary"
              : "bg-secondary-container/30 text-secondary",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
          <p className="mt-0.5 text-label-md text-on-surface-variant">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
