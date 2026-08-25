import clsx from "clsx";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm",
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
