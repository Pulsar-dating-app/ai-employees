import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";

// Product cards on a web-chat reply (2026-09-09). The pure "which products
// does this reply name" decision is unit-tested
// (tests/unit/chat/product-cards.test.ts); what needs a real database is
// the half that migration 20260909094029 added -- that `messages.metadata`
// exists, round-trips a jsonb card payload unchanged, and is covered by the
// same RLS as the rest of the row rather than being a new leak.
describe("messages.metadata: product-card payload storage and isolation", () => {
  const cards = {
    products: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "The Hidden Snowboard",
        price: "749.95",
        currency: "USD",
        imageUrl: "https://cdn.shopify.com/hidden.jpg",
        url: "https://staffra.io/c/QHxUvNJy5pk",
      },
    ],
  };

  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function createConversation(owner: TestUser, companyId: string) {
    const { data: customer, error: customerError } = await owner.client
      .from("customers")
      .insert({ company_id: companyId, name: "Web Visitor", channel: "web_chat" })
      .select("id")
      .single();
    if (customerError) throw customerError;

    const { data: conversation, error: conversationError } = await owner.client
      .from("conversations")
      .insert({
        company_id: companyId,
        customer_id: (customer as { id: string }).id,
        channel: "web_chat",
        status: "active",
      })
      .select("id")
      .single();
    if (conversationError) throw conversationError;

    return (conversation as { id: string }).id;
  }

  it("round-trips a product-card payload unchanged", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Product Cards Co");
    const conversationId = await createConversation(owner, companyId);

    const { data, error } = await owner.client
      .from("messages")
      .insert({
        company_id: companyId,
        conversation_id: conversationId,
        role: "agent",
        content: "Encontrei algumas pranchas 😊",
        metadata: cards,
      })
      .select("content, metadata")
      .single();

    expect(error).toBeNull();
    // Exact equality, not a shape check: the payload is a snapshot of what
    // the customer was shown, so Postgres reordering or coercing a field
    // would silently rewrite history.
    expect((data as { metadata: unknown }).metadata).toEqual(cards);
  });

  it("defaults to null for a message with no cards, so plain replies are untouched", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Plain Reply Co");
    const conversationId = await createConversation(owner, companyId);

    const { data, error } = await owner.client
      .from("messages")
      .insert({
        company_id: companyId,
        conversation_id: conversationId,
        role: "agent",
        content: "Claro, posso ajudar!",
      })
      .select("metadata")
      .single();

    expect(error).toBeNull();
    expect((data as { metadata: unknown }).metadata).toBeNull();
  });

  it("does not expose another company's card payload", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Card Owner Co");
    const conversationId = await createConversation(owner, companyId);

    const { error: insertError } = await owner.client.from("messages").insert({
      company_id: companyId,
      conversation_id: conversationId,
      role: "agent",
      content: "Encontrei algumas pranchas 😊",
      metadata: cards,
    });
    expect(insertError).toBeNull();

    const outsider = await signUpTestUser("outsider");
    const { data, error } = await outsider.client.from("messages").select("metadata").eq("company_id", companyId);

    // RLS filters rather than errors, same shape the rest of messages-rls
    // asserts -- the point is that the payload is not readable.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("keeps the row append-only -- cards cannot be edited after the fact", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Append Only Co");
    const conversationId = await createConversation(owner, companyId);

    const { data: inserted, error: insertError } = await owner.client
      .from("messages")
      .insert({
        company_id: companyId,
        conversation_id: conversationId,
        role: "agent",
        content: "Encontrei algumas pranchas 😊",
        metadata: cards,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const { data: updated } = await owner.client
      .from("messages")
      .update({ metadata: { products: [] } })
      .eq("id", (inserted as { id: string }).id)
      .select("id");

    // No update policy exists, so the statement matches zero rows.
    expect(updated ?? []).toEqual([]);

    const { data: reread } = await owner.client
      .from("messages")
      .select("metadata")
      .eq("id", (inserted as { id: string }).id)
      .single();
    expect((reread as { metadata: unknown }).metadata).toEqual(cards);
  });
});
