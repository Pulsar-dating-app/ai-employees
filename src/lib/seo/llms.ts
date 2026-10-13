// Builds /llms.txt (https://llmstxt.org): a short Markdown brief that AI
// assistants and their crawlers can read in one request — what Staffra is,
// the key facts in quotable lines, every public page with a one-line
// summary, and the company identity. Pure so it can be unit-tested; the route
// handler (src/app/llms.txt/route.ts) resolves the copy and URLs.

export type LlmsLink = { title: string; url: string; note: string };
export type LlmsFact = { label: string; value: string };

export function buildLlmsTxt(input: {
  siteName: string;
  definition: string;
  facts: LlmsFact[];
  sections: { heading: string; links: LlmsLink[] }[];
  /** Closing section with plain lines (company identity). */
  company: { heading: string; lines: string[] };
  footer: string;
}): string {
  const lines: string[] = [`# ${input.siteName}`, "", `> ${input.definition}`, ""];

  for (const fact of input.facts) lines.push(`- **${fact.label}:** ${fact.value}`);
  lines.push("");

  for (const section of input.sections) {
    if (section.links.length === 0) continue;
    lines.push(`## ${section.heading}`, "");
    for (const link of section.links) lines.push(`- [${link.title}](${link.url}): ${link.note}`);
    lines.push("");
  }

  lines.push(`## ${input.company.heading}`, "", ...input.company.lines.map((l) => `- ${l}`), "", input.footer, "");
  return lines.join("\n");
}
