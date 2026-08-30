import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";

// Trello M2 -- `messages` has no HTTP route yet (M3 adds the public chat
// API that writes to it); this tests the RLS policies themselves directly
// via PostgREST, bypassing the Next.js app entirely, same style as
// company-whatsapp-connections-rls.test.ts and company-calendar-connections-rls.test.ts.
describe("messages RLS: company-member read/insert, cross-company denied, no update/delete", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  // No customers/conversations CRUD API exists yet -- insert directly via
  // the signed-up user's own RLS-scoped client, same escape hatch other
  // integration tests in this repo use for tables with no HTTP surface yet.
  async function createConversation(owner: TestUser, companyId: string) {
    const { data: customer, error: customerError } = await owner.client
      .from("customers")
      .insert({ company_id: companyId, name: "Web Visitor", channel: "web_chat" })
      .select("id")
      .single();
    if (customerError) throw customerError;

    const { data: conversation, error: conversationError } = await owner.client
      .from("conversations")
      .insert({ company_id: companyId, customer_id: (customer as { id: string }).id, channel: "web_chat", status: "active" })
      .select("id")
      .single();
    if (conversationError) throw conversationError;

    return (conversation as { id: string }).id;
  }

  it("lets a company member insert and read messages for their own company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Messages RLS Co");
    const conversationId = await createConversation(owner, companyId);

    const insert = await owner.client
      .from("messages")
      .insert({ company_id: companyId, conversation_id: conversationId, role: "customer", content: "Hi there" })
      .select("id, role, content");
    expect(insert.error).toBeNull();
    expect(insert.data).toHaveLength(1);
    expect(insert.data?.[0].content).toBe("Hi there");

    const read = await owner.client
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(1);
  });

  it("denies a non-member from reading or inserting messages for another company", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Messages Private Co");
    const conversationId = await createConversation(owner, companyId);

    await owner.client
      .from("messages")
      .insert({ company_id: companyId, conversation_id: conversationId, role: "agent", content: "Owner's message" });

    // RLS SELECT denial reads as an empty result set, not an error --
    // PostgREST/Postgres RLS filters rows silently rather than raising.
    const read = await outsider.client
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const insert = await outsider.client
      .from("messages")
      .insert({ company_id: companyId, conversation_id: conversationId, role: "customer", content: "Injected" });
    expect(insert.error).not.toBeNull();
    expect(insert.error?.code).toBe("42501");
  });

  it("has no update or delete policy -- messages are append-only", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Messages Append Only Co");
    const conversationId = await createConversation(owner, companyId);

    const { data: message, error: insertError } = await owner.client
      .from("messages")
      .insert({ company_id: companyId, conversation_id: conversationId, role: "customer", content: "Original" })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const update = await owner.client
      .from("messages")
      .update({ content: "Edited" })
      .eq("id", (message as { id: string }).id)
      .select();
    expect(update.error).not.toBeNull();
    expect(update.error?.code).toBe("42501");

    const del = await owner.client
      .from("messages")
      .delete()
      .eq("id", (message as { id: string }).id)
      .select();
    expect(del.error).not.toBeNull();
    expect(del.error?.code).toBe("42501");
  });
});
