import clsx from "clsx";

type AgentAvatarRole = "intent" | "locked";

const ROLE_CLASSES: Record<AgentAvatarRole, { bg: string; fg: string }> = {
  intent: { bg: "bg-intent-100", fg: "text-intent-500" },
  locked: { bg: "bg-neutral-100", fg: "text-neutral-400" },
};

const SIZE_CLASSES = {
  md: "h-12 w-12",
  lg: "h-20 w-20",
};

// No agent photography exists yet (see PRODUCT.md's Evidence on Hand), so
// every agent gets the same authored illustration style — a flat bust
// silhouette on a role-tinted tile — rather than a stock photo or a
// generic-icon stand-in. One consistent mark now, swappable for real art
// direction later without touching any layout that renders it.
export function AgentAvatar({
  role,
  size = "md",
  className,
}: {
  role: AgentAvatarRole;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const { bg, fg } = ROLE_CLASSES[role];

  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-lg",
        bg,
        SIZE_CLASSES[size],
        className,
      )}
    >
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={clsx("h-2/3 w-2/3", fg)}>
        <circle cx="20" cy="15" r="7" fill="currentColor" />
        <path
          d="M6 35c0-8.837 6.268-14 14-14s14 5.163 14 14"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
