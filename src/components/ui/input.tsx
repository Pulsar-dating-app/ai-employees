import clsx from "clsx";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

// Sidde "Human-Centric AI" (Stitch) field: filled surface-container-low, no
// border, lifts to white with an indigo focus ring.
export const FIELD_CLASSES =
  "w-full min-w-0 rounded-md bg-surface-container-low px-4 py-2.5 text-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60";

export const FIELD_LABEL_CLASSES = "text-xs font-semibold text-on-surface-variant";

export function Input({ label, error, id, className, ...props }: InputProps) {
  const inputId = id ?? (typeof props.name === "string" ? props.name : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={clsx(FIELD_CLASSES, error && "ring-2 ring-error/50", className)}
        {...props}
      />
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
