import { describe, expect, it } from "vitest";
import { buildLlmsTxt } from "@/lib/seo/llms";

describe("buildLlmsTxt", () => {
  const txt = buildLlmsTxt({
    siteName: "Staffra",
    definition: "A Staffra é uma plataforma de atendentes virtuais.",
    facts: [{ label: "Preço", value: "A partir de R$ 197 por mês" }],
    sections: [
      { heading: "Por tipo de negócio", links: [{ title: "Barbearias", url: "https://x/para/barbearias", note: "n" }] },
      { heading: "Vazia", links: [] },
    ],
    company: { heading: "Empresa", lines: ["CNPJ: 58.261.994/0001-80"] },
    footer: "Versões em inglês e italiano.",
  });

  it("follows the llms.txt shape: H1 name, blockquote summary, then sections", () => {
    const lines = txt.split("\n");
    expect(lines[0]).toBe("# Staffra");
    expect(lines[2]).toBe("> A Staffra é uma plataforma de atendentes virtuais.");
    expect(txt).toContain("- **Preço:** A partir de R$ 197 por mês");
    expect(txt).toContain("## Por tipo de negócio");
    expect(txt).toContain("- [Barbearias](https://x/para/barbearias): n");
  });

  it("skips empty sections and ends with the company identity", () => {
    expect(txt).not.toContain("## Vazia");
    expect(txt).toContain("## Empresa\n\n- CNPJ: 58.261.994/0001-80");
    expect(txt.trimEnd().endsWith("Versões em inglês e italiano.")).toBe(true);
  });
});
