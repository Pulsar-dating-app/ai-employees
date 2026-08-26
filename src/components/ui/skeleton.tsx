import clsx from "clsx";

// Shown instantly by Next.js (via loading.tsx route segments) while a page's
// Server Component is still fetching — the actual fix for "navigation feels
// slow" is fewer/parallel round-trips (see the dashboard pages), but a
// skeleton is what makes the wait itself read as instant rather than frozen.
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-neutral-200", className)} />;
}
