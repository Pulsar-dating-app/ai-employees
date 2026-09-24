import { describe, expect, it } from "vitest";
import { decideEmailAssignment, normalizeEmail } from "@/lib/team/invites";

// 2026-09-25 -- what adding a professional's email does (see
// src/lib/team/invites.ts): link an existing account, keep a pending invite,
// or refuse the address.
const HERE = "company-here";
const ELSEWHERE = "company-elsewhere";

describe("decideEmailAssignment", () => {
  it("keeps a pending invite when nobody has the address yet", () => {
    expect(decideEmailAssignment({ companyId: HERE, pendingInviteCompanyId: null, account: null })).toEqual({
      kind: "invite",
    });
  });

  it("makes a company-less account a member right away", () => {
    expect(
      decideEmailAssignment({
        companyId: HERE,
        pendingInviteCompanyId: null,
        account: { id: "u1", companyId: null, linkedHere: false },
      }),
    ).toEqual({ kind: "link", userId: "u1", addMember: true });
  });

  it("links an account already in this company (e.g. the owner) without touching its role", () => {
    expect(
      decideEmailAssignment({
        companyId: HERE,
        pendingInviteCompanyId: null,
        account: { id: "owner", companyId: HERE, linkedHere: false },
      }),
    ).toEqual({ kind: "link", userId: "owner", addMember: false });
  });

  it("refuses an account that already runs another schedule here", () => {
    expect(
      decideEmailAssignment({
        companyId: HERE,
        pendingInviteCompanyId: null,
        account: { id: "u1", companyId: HERE, linkedHere: true },
      }),
    ).toEqual({ kind: "conflict", error: "email_taken_in_company" });
  });

  it("refuses an account of another company (one company per account)", () => {
    expect(
      decideEmailAssignment({
        companyId: HERE,
        pendingInviteCompanyId: null,
        account: { id: "u1", companyId: ELSEWHERE, linkedHere: false },
      }),
    ).toEqual({ kind: "conflict", error: "email_in_other_company" });
  });

  it("refuses an address another professional is already waiting on", () => {
    expect(decideEmailAssignment({ companyId: HERE, pendingInviteCompanyId: HERE, account: null })).toEqual({
      kind: "conflict",
      error: "email_taken_in_company",
    });
    expect(decideEmailAssignment({ companyId: HERE, pendingInviteCompanyId: ELSEWHERE, account: null })).toEqual({
      kind: "conflict",
      error: "email_in_other_company",
    });
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeEmail("  Ana.Souza@Example.COM ")).toBe("ana.souza@example.com");
  });

  it("rejects what isn't an address", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("ana")).toBeNull();
    expect(normalizeEmail("ana@example")).toBeNull();
    expect(normalizeEmail("a b@example.com")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
});
