export type GroundingStatus = "grounded" | "regenerated" | "blocked";

export type StoredGroundingViolation = { kind: string; text: string };

export type StoredGrounding = {
  status: GroundingStatus;
  violations: StoredGroundingViolation[];
};

export type GroundingCounts = {
  checked: number;
  grounded: number;
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
}): StoredGrounding | null {
  if (!isStatus(outcome.status)) return null;
  if (outcome.status === "grounded") return { status: "grounded", violations: [] };

  const violations = outcome.violations
    .filter((v) => typeof v.kind === "string" && typeof v.text === "string")
    .slice(0, MAX_STORED_VIOLATIONS)
    .map((v) => ({ kind: v.kind, text: v.text }));

  return { status: outcome.status, violations };
}

export function readGrounding(value: unknown): StoredGrounding | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = (value as Record<string, unknown>).grounding;
  if (typeof raw !== "object" || raw === null) return null;

  const status = (raw as Record<string, unknown>).status;
  if (!isStatus(status)) return null;

  const rawViolations = (raw as Record<string, unknown>).violations;
  const violations = Array.isArray(rawViolations)
    ? rawViolations.flatMap((entry): StoredGroundingViolation[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const v = entry as Record<string, unknown>;
        if (typeof v.kind !== "string" || typeof v.text !== "string") return [];
        return [{ kind: v.kind, text: v.text }];
      })
    : [];

  return { status, violations };
}

export function isUnconfirmedPromise(grounding: StoredGrounding | null): boolean {
  return grounding?.status === "blocked";
}

export function countGrounding(values: readonly unknown[]): GroundingCounts {
  const counts: GroundingCounts = { checked: 0, grounded: 0, regenerated: 0, blocked: 0 };
  for (const value of values) {
    const grounding = readGrounding(value);
    if (!grounding) continue;
    counts.checked += 1;
    counts[grounding.status] += 1;
  }
  return counts;
}
