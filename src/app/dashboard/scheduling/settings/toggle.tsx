"use client";

import clsx from "clsx";

// Trello K3 — the pill switch the Stitch "Scheduling Settings" screen leans
// on (7 day rows + the approval row). First switch control in the app, kept
// local to this screen rather than promoted to src/components/ui until a
// second screen needs one. Renders as a real `role="switch"` button so it's
// keyboard- and screen-reader-operable, unlike the mock's styled checkbox.
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-12 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-primary" : "bg-surface-container-highest",
      )}
    >
      <span
        className={clsx(
          "inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform",
          checked ? "translate-x-[26px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
