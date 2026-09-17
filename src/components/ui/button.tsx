import clsx from "clsx";
import { SpinnerIcon } from "./icons";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  isLoading?: boolean;
  // Every call site keeps the plain spinner unless it opts into its own --
  // added for the onboarding CTAs' own loading mark (src/app/onboarding/
  // onboarding-loader.tsx) without changing the spinner anywhere else.
  loadingIndicator?: React.ReactNode;
};

// Staffra "Human-Centric AI" (Stitch): 48px-tall primary actions, filled
// indigo primary, tonal secondary, no-chrome ghost.
const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-on-primary hover:brightness-90",
  secondary:
    "border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high",
  ghost: "text-on-surface-variant hover:text-on-surface",
  // A destructive action's actual confirming click — bordered like secondary,
  // error-toned so it reads as "this one does something irreversible-ish."
  danger: "border border-error/40 bg-surface-container-lowest text-error hover:bg-error-container/40",
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "h-12 px-6 text-sm",
  sm: "h-9 px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  loadingIndicator,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={clsx(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        // Every other custom control in the app themes its own focus ring;
        // without this the primitive alone fell back to the UA default.
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {isLoading ? (loadingIndicator ?? <SpinnerIcon className="h-4 w-4" />) : null}
      {children}
    </button>
  );
}
