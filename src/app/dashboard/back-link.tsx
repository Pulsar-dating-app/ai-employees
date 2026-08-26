import Link from "next/link";

// Generic "back to X" used by every non-tab subpage (agent detail, agent
// settings) — the destination and label depend on where the page sits in
// the marketplace/my-agents IA, so both are passed in rather than fixed.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900"
    >
      ← {children}
    </Link>
  );
}
