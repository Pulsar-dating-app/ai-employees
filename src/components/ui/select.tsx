import clsx from "clsx";
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from "./input";

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label?: string;
  error?: string;
  options: SelectOption[];
};

// Custom chevron (Stitch) since we strip the native appearance for a
// consistent filled-field look across browsers. Exported for the one screen
// that needs a differently-sized select of its own (the bookings toolbar,
// which follows its Stitch screen's control chrome rather than this app's
// form-field chrome) — the data URI itself should never be pasted twice.
export const CHEVRON =
  "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 width=%2224%22 height=%2224%22><path fill=%22%23464555%22 d=%22M7 10l5 5 5-5z%22/></svg>')] bg-[length:20px] bg-[right_0.75rem_center] bg-no-repeat pr-10 appearance-none";

export function Select({ label, error, id, className, options, ...props }: SelectProps) {
  const selectId = id ?? (typeof props.name === "string" ? props.name : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={clsx(FIELD_CLASSES, CHEVRON, error && "ring-2 ring-error/50", className)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
