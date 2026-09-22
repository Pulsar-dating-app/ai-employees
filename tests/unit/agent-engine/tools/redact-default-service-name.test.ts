import { describe, expect, it } from "vitest";
import { redactDefaultServiceName } from "@/lib/agent-engine/tools/redact-default-service-name";

// The default/catch-all service is seeded with the literal name "Serviço
// padrão" (migration 20260903170000), and Ana used to read it straight back
// to the customer in a booking confirmation ("Serviço padrão: amanhã...").
describe("redactDefaultServiceName", () => {
  it("drops the field when it is exactly the seeded placeholder name", () => {
    const result = redactDefaultServiceName({ booked: true, serviceName: "Serviço padrão", startsAtLabel: "10h" });
    expect(result).toEqual({ booked: true, startsAtLabel: "10h" });
    expect(result).not.toHaveProperty("serviceName");
  });

  it("is case- and whitespace-insensitive (the same seeded value, differently cased or padded)", () => {
    for (const value of ["serviço padrão", "SERVIÇO PADRÃO", "  Serviço padrão  "]) {
      expect(redactDefaultServiceName({ serviceName: value })).not.toHaveProperty("serviceName");
    }
  });

  it("leaves a real service name alone, including a merchant's own rename", () => {
    for (const value of ["Corte de cabelo", "Consulta Geral", "Serviço padrão de beleza"]) {
      expect(redactDefaultServiceName({ serviceName: value })).toEqual({ serviceName: value });
    }
  });

  it("passes a result with no such field through unchanged", () => {
    const result = redactDefaultServiceName({ booked: false, reason: "service_not_found" });
    expect(result).toEqual({ booked: false, reason: "service_not_found" });
  });

  it("supports a custom field name, for list_services' defaultService.name", () => {
    const service = { id: "1", name: "Serviço padrão", description: "Avaliação geral" };
    const result = redactDefaultServiceName(service, "name");
    expect(result).toEqual({ id: "1", description: "Avaliação geral" });
  });

  it("doesn't mutate the original object", () => {
    const original = { serviceName: "Serviço padrão" };
    redactDefaultServiceName(original);
    expect(original).toEqual({ serviceName: "Serviço padrão" });
  });
});
