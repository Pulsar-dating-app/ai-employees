export type GroundingStatus = "grounded" | "regenerated" | "blocked";

export type StoredGroundingViolation = { kind: string; text: string };

export type StoredGrounding = {
  status: GroundingStatus;
  violations: StoredGroundingViolation[];
  claims: number;
};

export type GroundingCounts = {
  verified: number;
  regenerated: number;
  blocked: number;
};

const STATUSES: readonly string[] = ["grounded", "regenerated", "blocked"];

const MAX_STORED_VIOLATIONS = 5;

function isStatus(value: unknown): value is GroundingStatus {
  return typeof value === "string" && STATUSES.includes(value);
}

export function toStoredGrounding(outcome: {
  status: string;
  violations: readonly { kind: string; text: string }[];
  claimCount?: number;
}): StoredGrounding | null {
  if (!isStatus(outcome.status)) return null;

  const claims =
    typeof outcome.claimCount === "number" && Number.isFinite(outcome.claimCount)
      ? Math.max(0, Math.trunc(outcome.claimCount))
      : 0;

  if (outcome.status === "grounded") return { status: "grounded", violations: [], claims };

  const violations = outcome.violations
    .filter((v) => typeof v.kind === "string" && typeof v.text === "string")
    .slice(0, MAX_STORED_VIOLATIONS)
    .map((v) => ({ kind: v.kind, text: v.text }));

  return { status: outcome.status, violations, claims };
}

export function readGrounding(value: unknown): StoredGrounding | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = (value as Record<string, unknown>).grounding;
  if (typeof raw !== "object" || raw === null) return null;

  const status = (raw as Record<string, unknown>).status;
  if (!isStatus(status)) return null;

  const rawClaims = (raw as Record<string, unknown>).claims;
  const claims =
    typeof rawClaims === "number" && Number.isFinite(rawClaims) ? Math.max(0, Math.trunc(rawClaims)) : 0;

  const rawViolations = (raw as Record<string, unknown>).violations;
  const violations = Array.isArray(rawViolations)
    ? rawViolations.flatMap((entry): StoredGroundingViolation[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const v = entry as Record<string, unknown>;
        if (typeof v.kind !== "string" || typeof v.text !== "string") return [];
        return [{ kind: v.kind, text: v.text }];
      })
    : [];

  return { status, violations, claims };
}

export function isUnconfirmedPromise(grounding: StoredGrounding | null): boolean {
  return grounding?.status === "blocked";
}

// A reply only counts as *verified* when it actually stated a price or stock
// figure that the check then traced to real data. `grounded` on its own does
// not mean that: a reply quoting no figure is trivially grounded, and
// counting small talk as a verified answer is exactly the overclaim this
// surface exists to avoid.
export function isVerifiedAnswer(grounding: StoredGrounding | null): boolean {
  return grounding?.status === "grounded" && grounding.claims > 0;
}

export function countGrounding(values: readonly unknown[]): GroundingCounts {
  const counts: GroundingCounts = { verified: 0, regenerated: 0, blocked: 0 };
  for (const value of values) {
    const grounding = readGrounding(value);
    if (!grounding) continue;
    if (grounding.status === "grounded") {
      if (grounding.claims > 0) counts.verified += 1;
    } else {
      counts[grounding.status] += 1;
    }
  }
  return counts;
}
