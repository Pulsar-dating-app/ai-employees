import { describe, expect, it } from "vitest";
import { validateIntakeAnswer, slugifyIntakeLabel } from "@/lib/appointments/intake-fields";

// Trello R2 -- the pure validation + slug helpers behind the typed intake
// model. The DB trigger, route rebuild and repository enforcement are
// covered by the integration suite.
describe("validateIntakeAnswer", () => {
  it("accepts a well-formed email and rejects junk", () => {
    expect(validateIntakeAnswer("email", "leo@example.com")).toBeNull();
    expect(validateIntakeAnswer("email", "  leo@example.com ")).toBeNull();
    expect(validateIntakeAnswer("email", "not-an-email")).toBe("not_an_email");
    expect(validateIntakeAnswer("email", "leo@")).toBe("not_an_email");
  });

  it("requires 11 digits for a CPF, ignoring punctuation", () => {
    expect(validateIntakeAnswer("cpf", "123.456.789-00")).toBeNull();
    expect(validateIntakeAnswer("cpf", "12345678900")).toBeNull();
    expect(validateIntakeAnswer("cpf", "123")).toBe("not_a_cpf");
  });

  it("wants at least 8 digits for a phone", () => {
    expect(validateIntakeAnswer("phone", "+55 11 91234-5678")).toBeNull();
    expect(validateIntakeAnswer("phone", "1234")).toBe("not_a_phone");
  });

  it("accepts common date shapes", () => {
    expect(validateIntakeAnswer("date", "10/05/1998")).toBeNull();
    expect(validateIntakeAnswer("date", "1998-05-10")).toBeNull();
    expect(validateIntakeAnswer("date", "ontem")).toBe("not_a_date");
  });

  it("treats name/text as free-form but still rejects empty", () => {
    expect(validateIntakeAnswer("name", "Leo Vinagre")).toBeNull();
    expect(validateIntakeAnswer("text", "qualquer coisa")).toBeNull();
    expect(validateIntakeAnswer("text", "   ")).toBe("empty");
  });
});

describe("slugifyIntakeLabel", () => {
  it("lowercases, strips accents, and underscores non-alphanumerics", () => {
    expect(slugifyIntakeLabel("Motivo da Consulta")).toBe("motivo_da_consulta");
    expect(slugifyIntakeLabel("Convênio?")).toBe("convenio");
    expect(slugifyIntakeLabel("  CPF  ")).toBe("cpf");
  });

  it("falls back to 'campo' for a label with nothing sluggable", () => {
    expect(slugifyIntakeLabel("!!!")).toBe("campo");
  });
});
