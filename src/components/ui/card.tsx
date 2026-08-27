import clsx from "clsx";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

// Sidde "Human-Centric AI" (Stitch): rounded-xl surface card, hairline
// outline, soft ambient elevation (level1), lifting to level2 on hover for
// interactive cards. The two exports are reused on the marketplace / my-team
// link cards, which are <Link>s rather than <Card>s.
export const CARD_SHADOW = "shadow-level1";
export const CARD_SHADOW_HOVER = "hover:shadow-level2";

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-outline-variant bg-surface-container-lowest p-6",
        CARD_SHADOW,
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={clsx("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: DivProps) {
  return (
    <h3 className={clsx("text-lg font-semibold text-on-surface", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: DivProps) {
  return <p className={clsx("text-sm text-on-surface-variant", className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={clsx("flex flex-col gap-3", className)} {...props} />;
}
