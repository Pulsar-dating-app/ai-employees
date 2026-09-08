import { describe, expect, it } from "vitest";
import { splitOnUrls } from "@/lib/chat/linkify";

// Agent replies routinely end with a checkout link; these pin the parsing
// that turns it into a clickable anchor without eating the sentence's
// punctuation or matching non-http schemes.

describe("splitOnUrls", () => {
  it("returns a single text segment when there is no URL", () => {
    expect(splitOnUrls("olá, tudo bem?")).toEqual([{ type: "text", value: "olá, tudo bem?" }]);
  });

  it("splits a trailing checkout link out of the surrounding text", () => {
    expect(
      splitOnUrls("Finalize a compra aqui: https://www.staffra.io/c/QHxUvNJy5pk"),
    ).toEqual([
      { type: "text", value: "Finalize a compra aqui: " },
      {
        type: "link",
        value: "https://www.staffra.io/c/QHxUvNJy5pk",
        href: "https://www.staffra.io/c/QHxUvNJy5pk",
      },
    ]);
  });

  it("peels a sentence-final period off the URL", () => {
    const segments = splitOnUrls("veja https://staffra.io/x.");
    expect(segments).toEqual([
      { type: "text", value: "veja " },
      { type: "link", value: "https://staffra.io/x", href: "https://staffra.io/x" },
      { type: "text", value: "." },
    ]);
  });

  it("handles a URL wrapped in parentheses", () => {
    expect(splitOnUrls("(https://staffra.io/a)")).toEqual([
      { type: "text", value: "(" },
      { type: "link", value: "https://staffra.io/a", href: "https://staffra.io/a" },
      { type: "text", value: ")" },
    ]);
  });

  it("matches multiple URLs in one message", () => {
    const segments = splitOnUrls("um https://a.com dois https://b.com fim");
    expect(segments.filter((s) => s.type === "link").map((s) => s.value)).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("ignores non-http(s) schemes", () => {
    expect(splitOnUrls("mande pra javascript:alert(1) agora")).toEqual([
      { type: "text", value: "mande pra javascript:alert(1) agora" },
    ]);
  });

  it("keeps http and https, nothing else", () => {
    const segments = splitOnUrls("http://x.com e https://y.com");
    expect(segments.filter((s) => s.type === "link").map((s) => s.href)).toEqual([
      "http://x.com",
      "https://y.com",
    ]);
  });
});
