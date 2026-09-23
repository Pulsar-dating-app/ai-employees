import clsx from "clsx";
import { InfoIcon, WarningIcon } from "./icons";

type Tone = "error" | "warn" | "info";

const TONES: Record<Tone, { shell: string; badge: string; title: string; body: string }> = {
  error: {
    shell: "border-error/25 bg-error-container/45",
    badge: "bg-error text-on-error",
    title: "text-on-error-container",
    body: "text-on-error-container/90",
  },
  warn: {
    shell: "border-[#f3d27a] bg-[#fff6dc]",
    badge: "bg-[#f0b429] text-[#3d2a00]",
    title: "text-[#5c3d00]",
    body: "text-[#6b4a00]",
  },
  info: {
    shell: "border-primary/15 bg-primary-fixed/45",
    badge: "bg-primary text-on-primary",
    title: "text-on-primary-fixed",
    body: "text-on-surface-variant",
  },
};

export function StatusBanner({
  tone,
  title,
  body,
  action,
}: {
  tone: Tone;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const styles = TONES[tone];
  const Icon = tone === "info" ? InfoIcon : WarningIcon;
  return (
    <div
      role="status"
      className={clsx(
        "flex flex-col gap-4 rounded-[20px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        styles.shell,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", styles.badge)}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className={clsx("text-label-md font-bold", styles.title)}>{title}</h3>
          <p className={clsx("mt-0.5 text-sm", styles.body)}>{body}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
