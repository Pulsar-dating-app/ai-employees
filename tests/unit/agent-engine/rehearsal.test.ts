import { describe, expect, it, vi } from "vitest";
import { isRehearsalSafe, resolveRehearsalToolsForAgent } from "@/lib/agent-engine/tools/rehearsal";
import { resolveToolsForAgent } from "@/lib/agent-engine/tools/tool-sets";

// Anything that writes has to be swapped, or the first session's proof step
// books real appointments, sends real confirmation emails and puts events in
// the merchant's metrics.
const WRITERS = [
  "book_appointment",
  "cancel_appointment",
  "reschedule_appointment",
  "add_to_waitlist",
  "flag_buying_intent",
  "request_human",
  "create_checkout_link",
];

describe("rehearsal tool set", () => {
  it("keeps the agent's full tool list, swapping rather than removing", () => {
    for (const slug of ["malu", "ana"]) {
      const real = resolveToolsForAgent(slug).map((t) => t.name).sort();
      const rehearsed = resolveRehearsalToolsForAgent(slug).map((t) => t.name).sort();
      // A scheduling agent with no booking tool cannot finish the conversation
      // she just started, which demonstrates less than not demonstrating.
      expect(rehearsed, slug).toEqual(real);
    }
  });

  it("classifies every writer as unsafe and leaves the readers alone", () => {
    for (const name of WRITERS) expect(isRehearsalSafe(name), name).toBe(false);
    for (const name of ["search_products", "get_product", "list_services", "find_available_slots"]) {
      expect(isRehearsalSafe(name), name).toBe(true);
    }
  });

  it("reports success from the booking tool without touching the database", async () => {
    const tool = resolveRehearsalToolsForAgent("ana").find((t) => t.name === "book_appointment")!;
    const supabase = { from: vi.fn() };
    const result = await tool.execute({ serviceId: "x", startsAt: "2027-01-01T10:00:00Z" }, {
      companyId: "c",
      agentId: "a",
      conversationId: "conv",
      customerId: "cust",
      supabase,
      openai: {},
    } as never);

    expect(result).toEqual({ booked: true });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("records no buying intent", async () => {
    const tool = resolveRehearsalToolsForAgent("malu").find((t) => t.name === "flag_buying_intent")!;
    const supabase = { from: vi.fn() };
    await tool.execute({}, { companyId: "c", supabase } as never);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  // The one writer that cannot just return a token: a checkout link the
  // merchant clicks has to go somewhere, and the real tool's tracked /c/ URL
  // is backed by an events row a rehearsal must not create.
  it("hands back the product's own link instead of minting a tracked one", async () => {
    const tool = resolveRehearsalToolsForAgent("malu").find((t) => t.name === "create_checkout_link")!;
    const maybeSingle = vi.fn().mockResolvedValue({ data: { product_url: "https://shop.example/tee" } });
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    };

    const result = await tool.execute({ productId: "p1" }, {
      companyId: "c",
      supabase,
    } as never);
    expect(result).toEqual({ url: "https://shop.example/tee" });
  });

  it("says plainly when a product has no link, rather than inventing one", async () => {
    const tool = resolveRehearsalToolsForAgent("malu").find((t) => t.name === "create_checkout_link")!;
    const maybeSingle = vi.fn().mockResolvedValue({ data: { product_url: null } });
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    };

    const result = (await tool.execute({ productId: "p1" }, { companyId: "c", supabase } as never)) as {
      error?: string;
      url?: string;
    };
    expect(result.url).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});
