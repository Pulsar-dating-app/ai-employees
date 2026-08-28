// Plain module (no "use client") so the Server Component `page.tsx` gets the
// real values — importing a runtime constant *from* a "use client" module
// into a server component yields a client-reference stub, not the value.
export const RANGE_DAYS = ["7", "30", "90"] as const;
export const DEFAULT_RANGE_DAYS = "30";
