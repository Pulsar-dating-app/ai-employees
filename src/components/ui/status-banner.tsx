import clsx from "clsx";
import { WarningIcon } from "./icons";

export function StatusBanner({
  tone,
  title,
  body,
  action,
}: {
  tone: "error" | "warn";
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={clsx(
        "flex flex-col gap-4 rounded-[20px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        tone === "error" ? "border-error/25 bg-error-container/45" : "border-[#f3d27a] bg-[#fff6dc]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            tone === "error" ? "bg-error text-on-error" : "bg-[#f0b429] text-[#3d2a00]",
          )}
        >
          <WarningIcon className="h-4 w-4" />
        </span>
        <div>
          <h3
            className={clsx("text-label-md font-bold", tone === "error" ? "text-on-error-container" : "text-[#5c3d00]")}
          >
            {title}
          </h3>
          <p className={clsx("mt-0.5 text-sm", tone === "error" ? "text-on-error-container/90" : "text-[#6b4a00]")}>
            {body}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
