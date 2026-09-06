import type { ReactNode } from "react";
import { WarningIcon, InfoIcon } from "./icons";

// Stitch "Alert Component System - Showcase" — reproduced from the four
// variants shown there (warning/info/success/error); three of the four this
// app actually needs are wired up (warning, info — Scheduling's
// missing-config banners; error — a lapsed payment). Add "success" the same
// way when a real caller needs it, rather than pre-building it unused.
//
// Colors: info/warning use this app's own design tokens (primary-fixed
// family) where the showcase did too. The showcase's warning swatch has no
// token equivalent in this palette (Material's role set has no "warning"
// role) — its own comment says as much and falls back to raw amber RGB,
// which is Tailwind's stock `orange-50/500/600/700/800` scale exactly, so
// those are used directly rather than inventing new CSS variables for a
// one-variant need. `error` uses this app's actual error/error-container
// tokens (same ones the billing settings page's own past-due banner uses),
// which do exist in this palette.
export type AlertVariant = "warning" | "info" | "error";

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
  error: {
    bg: "bg-error-container/50",
    border: "border-error/30",
    bar: "bg-error",
    icon: "text-error",
    title: "text-on-error-container",
    body: "text-on-error-container",
    Icon: WarningIcon,
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
