import clsx from "clsx";
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from "./input";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export function Textarea({ label, error, id, className, rows = 4, ...props }: TextareaProps) {
  const textareaId = id ?? (typeof props.name === "string" ? props.name : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={textareaId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      ) : null}
      <textarea
        id={textareaId}
        rows={rows}
        className={clsx(FIELD_CLASSES, "resize-y", error && "ring-2 ring-error/50", className)}
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
