import { describe, expect, it } from "vitest";
import {
  AGENT_TOOL_SETS,
  UnknownToolNameError,
  resolveToolsForAgent,
} from "@/lib/agent-engine/tools/tool-sets";
import { defaultTools } from "@/lib/agent-engine/tools/registry";
import type { AgentTool } from "@/lib/agent-engine/tools/types";

function namesFor(slug: string): string[] {
  return resolveToolsForAgent(slug).map((tool) => tool.name);
}

describe("AGENT_TOOL_SETS", () => {
  // The load-bearing test: a typo in the map would silently strip a
  // capability, and an agent quietly losing a tool is close to invisible in
  // an LLM product -- she just stops being able to do something.
  it("only lists tools that a registered tool actually provides", () => {
    const registered = new Set(defaultTools.map((tool) => tool.name));

    for (const [slug, toolNames] of Object.entries(AGENT_TOOL_SETS)) {
      for (const name of toolNames) {
        expect(registered, `${slug} -> ${name}`).toContain(name);
      }
    }
  });

  it("throws loudly rather than silently dropping an unknown tool name", () => {
    const onlyOne = defaultTools.filter((t) => t.name === "request_human");
    expect(() => resolveToolsForAgent("malu", onlyOne)).toThrow(UnknownToolNameError);
  });
});

describe("resolveToolsForAgent", () => {
  it("gives Malu the sales tools", () => {
    const names = namesFor("malu");
    expect(names).toEqual(
      expect.arrayContaining([
        "search_products",
        "get_product",
        "create_checkout_link",
        "flag_buying_intent",
      ]),
    );
  });

  it("never offers Ana the catalogue or checkout tools", () => {
    // The whole point of J2: a scheduling assistant must not be able to
    // offer to sell a product or mint a checkout link.
    const names = namesFor("ana");
    expect(names).not.toContain("search_products");
    expect(names).not.toContain("get_product");
    expect(names).not.toContain("create_checkout_link");
    expect(names).not.toContain("flag_buying_intent");
  });

  it("gives Ana the scheduling tools (J3)", () => {
    const names = namesFor("ana");
    expect(names).toEqual(
      expect.arrayContaining([
        "list_services",
        "find_available_slots",
        "book_appointment",
        "cancel_appointment",
      ]),
    );
  });

  it("never offers Malu the scheduling tools", () => {
    // The other direction of J2/J3: a sales rep must not offer to book or
    // cancel appointments.
    const names = namesFor("malu");
    expect(names).not.toContain("find_available_slots");
    expect(names).not.toContain("book_appointment");
    expect(names).not.toContain("cancel_appointment");
  });

  it("gives every agent the shared business-knowledge and escalation tools", () => {
    for (const slug of ["malu", "ana", "some-unmapped-agent"]) {
      const names = namesFor(slug);
      expect(names, slug).toContain("get_business_information");
      expect(names, slug).toContain("get_policy_information");
      expect(names, slug).toContain("request_human");
    }
  });

  it("falls back to the common set for an unmapped agent, never the full registry", () => {
    // Falling back to everything would silently reintroduce the exact bug
    // this ticket fixes, and do it invisibly for every future agent.
    const names = namesFor("brand-new-agent-nobody-mapped-yet");

    expect(names).toEqual([
      "get_business_information",
      "get_policy_information",
      "request_human",
    ]);
    expect(names.length).toBeLessThan(defaultTools.length);
  });

  it("returns real tool objects from the registry, not copies", () => {
    const resolved = resolveToolsForAgent("malu");
    for (const tool of resolved) {
      expect(defaultTools).toContain(tool);
    }
  });

  it("resolves against an injected tool list rather than the real registry", () => {
    const stubs: AgentTool[] = ["get_business_information", "get_policy_information", "request_human"].map(
      (name) => ({ name, description: "stub", parameters: null, execute: async () => null }),
    );

    const resolved = resolveToolsForAgent("unmapped", stubs);

    expect(resolved).toEqual(stubs);
    // Came from the injected list, not the module-level registry.
    expect(defaultTools).not.toContain(resolved[0]);
  });
});
