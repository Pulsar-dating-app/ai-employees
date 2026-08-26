import clsx from "clsx";

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label?: string;
  error?: string;
  options: SelectOption[];
};

export function Select({ label, error, id, className, options, ...props }: SelectProps) {
  const selectId = id ?? (typeof props.name === "string" ? props.name : undefined);

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={selectId} className="text-sm font-medium text-neutral-900">
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={clsx(
          "w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
          error && "border-red-400",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
