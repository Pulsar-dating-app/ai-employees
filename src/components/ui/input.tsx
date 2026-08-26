import clsx from "clsx";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, id, className, ...props }: InputProps) {
  const inputId = id ?? (typeof props.name === "string" ? props.name : undefined);

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-neutral-900">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={clsx(
          "w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-accent-500 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
          error && "border-red-400",
          className,
        )}
        {...props}
      />
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
