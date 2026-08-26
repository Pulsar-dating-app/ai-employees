import clsx from "clsx";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

// Two-layer shadow (tight contact + soft ambient) instead of a flat
// shadow-sm — the depth an admin surface needs to read as raised, not just
// outlined.
export const CARD_SHADOW = "shadow-[0_1px_2px_rgba(28,25,23,0.06),0_8px_24px_-8px_rgba(28,25,23,0.10)]";
export const CARD_SHADOW_HOVER = "hover:shadow-[0_2px_4px_rgba(28,25,23,0.08),0_16px_32px_-8px_rgba(28,25,23,0.16)]";

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={clsx("rounded-lg border border-neutral-200 bg-white p-6", CARD_SHADOW, className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={clsx("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: DivProps) {
  return (
    <h3
      className={clsx("text-base font-semibold text-neutral-900", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: DivProps) {
  return <p className={clsx("text-sm text-neutral-500", className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={clsx("flex flex-col gap-3", className)} {...props} />;
}
