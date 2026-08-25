import clsx from "clsx";
import { SpinnerIcon } from "./icons";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
  isLoading?: boolean;
};

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-600 disabled:hover:bg-accent-500",
  secondary:
    "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 disabled:hover:bg-white",
  ghost: "text-neutral-600 hover:text-neutral-900 disabled:hover:text-neutral-600",
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-sm",
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
