import clsx from "clsx";
import { CheckIcon } from "./icons";

type StepStatus = "done" | "active" | "locked";

export function StepBadge({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-500 text-white">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
        status === "active" ? "border-accent-500" : "border-neutral-300",
      )}
    >
      {status === "active" ? (
        <span className="h-2 w-2 rounded-full bg-accent-500" />
      ) : null}
    </span>
  );
}
