import { describe, expect, it } from "vitest";
import { formatWhen } from "@/lib/email/appointments";

describe("formatWhen", () => {
  it("formats the appointment time in the email's language", () => {
    const startsAt = "2026-10-01T17:00:00Z";
    expect(formatWhen(startsAt, "America/Sao_Paulo")).toContain("quinta-feira");
    expect(formatWhen(startsAt, "America/Sao_Paulo", "en")).toContain("Thursday");
    expect(formatWhen(startsAt, "America/Sao_Paulo", "it")).toContain("giovedì");
  });
});
