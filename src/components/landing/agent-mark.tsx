// One authored mark for every agent — no agent photography exists yet (see
// PRODUCT.md's Evidence on Hand), so this is a deliberate illustrated
// placeholder rather than a stock photo or a generic icon standing in.
export function AgentMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      <circle cx="20" cy="15" r="7" fill="currentColor" />
      <path
        d="M6 35c0-8.837 6.268-14 14-14s14 5.163 14 14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
