import Image from "next/image";
import clsx from "clsx";

type AgentAvatarRole = "intent" | "locked";

const ROLE_CLASSES: Record<AgentAvatarRole, { bg: string; fg: string }> = {
  intent: { bg: "bg-primary-fixed", fg: "text-primary" },
  locked: { bg: "bg-surface-container", fg: "text-outline" },
};

const SIZE_CLASSES = {
  md: "h-12 w-12",
  lg: "h-20 w-20",
};

// Real portraits (Stitch) are used where we have one — see
// `src/lib/agents/media.ts`. Without a `photoSrc` every agent falls back to
// the authored mark: a flat bust silhouette on a role-tinted tile, never a
// generic-icon stand-in.
export function AgentAvatar({
  role,
  size = "md",
  photoSrc,
  alt = "",
  className,
}: {
  role: AgentAvatarRole;
  size?: keyof typeof SIZE_CLASSES;
  photoSrc?: string | null;
  alt?: string;
  className?: string;
}) {
  const { bg, fg } = ROLE_CLASSES[role];

  return (
    <div
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
        bg,
        SIZE_CLASSES[size],
        className,
      )}
    >
      {photoSrc ? (
        <Image src={photoSrc} alt={alt} fill sizes="80px" className="object-cover object-top" />
      ) : (
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={clsx("h-2/3 w-2/3", fg)}>
          <circle cx="20" cy="15" r="7" fill="currentColor" />
          <path
            d="M6 35c0-8.837 6.268-14 14-14s14 5.163 14 14"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
