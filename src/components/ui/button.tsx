import clsx from "clsx";
import { SpinnerIcon } from "./icons";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  isLoading?: boolean;
};

// Sidde "Human-Centric AI" (Stitch): 48px-tall primary actions, filled
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
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {isLoading ? <SpinnerIcon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
