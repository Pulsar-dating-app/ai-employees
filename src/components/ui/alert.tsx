import type { ReactNode } from "react";
import { WarningIcon, InfoIcon } from "./icons";

// Stitch "Alert Component System - Showcase" — reproduced from the four
// variants shown there (warning/info/success/error); only the two this app
// actually needs yet (warning, info — Scheduling's missing-config banners)
// are wired up. Add "success"/"error" to VARIANT_STYLES the same way when a
// real caller needs one, rather than pre-building unused variants now.
//
// Colors: info/warning use this app's own design tokens (primary-fixed
// family) where the showcase did too. The showcase's warning swatch has no
// token equivalent in this palette (Material's role set has no "warning"
// role) — its own comment says as much and falls back to raw amber RGB,
// which is Tailwind's stock `orange-50/500/600/700/800` scale exactly, so
// those are used directly rather than inventing new CSS variables for a
// one-variant need.
export type AlertVariant = "warning" | "info";

const VARIANT_STYLES: Record<
  AlertVariant,
  {
    bg: string;
    border: string;
    bar: string;
    icon: string;
    title: string;
    body: string;
    Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  }
> = {
  warning: {
    bg: "bg-orange-50",
    border: "border-orange-500",
    bar: "bg-orange-500",
    icon: "text-orange-600",
    title: "text-orange-800",
    body: "text-orange-700",
    Icon: WarningIcon,
  },
  info: {
    bg: "bg-primary-fixed",
    border: "border-primary-fixed-dim",
    bar: "bg-primary",
    icon: "text-primary",
    title: "text-on-primary-fixed",
    body: "text-on-primary-fixed-variant",
    Icon: InfoIcon,
  },
};

export function Alert({
  variant,
  title,
  children,
  action,
}: {
  variant: AlertVariant;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const s = VARIANT_STYLES[variant];

  return (
    <div className={`relative flex items-start gap-3 overflow-hidden rounded-lg border p-4 ${s.bg} ${s.border}`}>
      <div aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
      <div className="mt-0.5 shrink-0">
        <s.Icon className={`h-5 w-5 ${s.icon}`} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={`text-sm font-semibold ${s.title}`}>{title}</h3>
        <p className={`mt-1 text-sm ${s.body}`}>{children}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
