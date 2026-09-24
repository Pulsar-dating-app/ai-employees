import { describe, expect, it } from "vitest";
import { checkTeamAction, type TeamAction } from "@/lib/team/roles";
import type { CompanyRole } from "@/lib/auth/company-access";

// 2026-09-25 -- owners/admins promote; only the owner demotes or removes;
// the owner is untouchable and nobody changes themselves.
const PROMOTE: TeamAction = { kind: "set_role", role: "admin" };
const DEMOTE: TeamAction = { kind: "set_role", role: "member" };
const REMOVE: TeamAction = { kind: "remove" };

function check(actorRole: CompanyRole, targetRole: CompanyRole, action: TeamAction, self = false) {
  return checkTeamAction({ actorRole, actorId: "actor", targetRole, targetId: self ? "actor" : "target", action });
}

describe("checkTeamAction", () => {
  it("lets an owner or an admin promote a member", () => {
    expect(check("owner", "member", PROMOTE)).toEqual({ ok: true });
    expect(check("admin", "member", PROMOTE)).toEqual({ ok: true });
  });

  it("lets only the owner demote an admin", () => {
    expect(check("owner", "admin", DEMOTE)).toEqual({ ok: true });
    expect(check("admin", "admin", DEMOTE)).toEqual({ ok: false, reason: "owner_only" });
  });

  it("lets only the owner remove someone", () => {
    expect(check("owner", "member", REMOVE)).toEqual({ ok: true });
    expect(check("owner", "admin", REMOVE)).toEqual({ ok: true });
    expect(check("admin", "member", REMOVE)).toEqual({ ok: false, reason: "owner_only" });
  });

  it("never touches the owner", () => {
    expect(check("admin", "owner", DEMOTE)).toEqual({ ok: false, reason: "owner_locked" });
    expect(check("admin", "owner", REMOVE)).toEqual({ ok: false, reason: "owner_locked" });
  });

  it("refuses changing yourself, and members changing anyone", () => {
    expect(check("admin", "admin", DEMOTE, true)).toEqual({ ok: false, reason: "cannot_change_self" });
    expect(check("member", "member", PROMOTE)).toEqual({ ok: false, reason: "admin_only" });
  });

  it("reports a role that is already set", () => {
    expect(check("owner", "admin", PROMOTE)).toEqual({ ok: false, reason: "no_change" });
  });
});
