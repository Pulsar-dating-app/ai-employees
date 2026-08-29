import { beforeAll, describe, expect, it } from "vitest";
import { createCheckoutLinkTool } from "@/lib/agent-engine/tools/create-checkout-link";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { getTestEnv } from "./helpers/env";

// Trello ticket E1 -- unlike C4's test, this one goes over real HTTP (there
// IS a route now), matching this repo's default convention. The link under
// test is minted by C4's real tool, so this exercises the whole loop end to
// end: mint -> tap -> click event -> redirect.

const DESTINATION = "https://loja.example.com/vestido-e1";
const HUMAN_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// One signed-up user / company / product for the whole file, with a fresh
// conversation per test. The suite already makes ~87 signup calls against
// Supabase's `sign_in_sign_ups = 30` per-5-minutes-per-IP limit
// (supabase/config.toml), so a per-test signup here is real added flake for
// no isolation benefit -- these tests only need distinct conversations, which
// are plain inserts.
let shared: {
  owner: Awaited<ReturnType<typeof signUpTestUser>>;
  companyId: string;
  agentId: string;
  customerId: string;
  productId: string;
};

beforeAll(async () => {
  process.env.SIDDE_CHECKOUT_BASE_URL = "https://checkout-test.example";

  const owner = await signUpTestUser("owner");
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: "E1 Redirect Co",
  });
  const companyId = created.json.company.id;

  const hired = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/malu`,
    owner.cookieHeader,
  );

  const { data: customer } = await owner.client
    .from("customers")
    .insert({ company_id: companyId, name: "E1 Customer", channel: "whatsapp" })
    .select()
    .single();

  const product = await api<{ product: { id: string } }>(
    "POST",
    `/api/companies/${companyId}/products`,
    owner.cookieHeader,
    { name: "Vestido E1", product_url: DESTINATION },
  );

  shared = {
    owner,
    companyId,
    agentId: hired.json.companyAgent.agent_id,
    customerId: customer!.id,
    productId: product.json.product.id,
  };
});

// fetch() follows redirects by default, which would chase the merchant's
// (nonexistent) domain -- `manual` keeps the 302 itself observable.
async function tap(trackingId: string, userAgent: string = HUMAN_UA) {
  return fetch(`${getTestEnv().baseUrl}/c/${trackingId}`, {
    redirect: "manual",
    headers: { "user-agent": userAgent },
  });
}

// Fresh conversation per call, so each test's click events are isolated
// without needing its own user.
async function seedLink() {
  const { data: conversation } = await shared.owner.client
    .from("conversations")
    .insert({
      company_id: shared.companyId,
      agent_id: shared.agentId,
      customer_id: shared.customerId,
      channel: "whatsapp",
      status: "active",
    })
    .select()
    .single();

  const ctx: ToolExecutionContext = {
    companyId: shared.companyId,
    agentId: shared.agentId,
    conversationId: conversation!.id,
    customerId: shared.customerId,
    supabase: getTestServiceClient(),
    openai: {} as ToolExecutionContext["openai"],
  };

  const minted = (await createCheckoutLinkTool.execute({ productId: shared.productId }, ctx)) as {
    trackingId: string;
  };

  return {
    trackingId: minted.trackingId,
    companyId: shared.companyId,
    agentId: shared.agentId,
    conversationId: conversation!.id,
    customerId: shared.customerId,
    productId: shared.productId,
  };
}

async function clickEventsFor(conversationId: string) {
  const { data } = await getTestServiceClient()
    .from("events")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("type", "checkout_click");
  return data ?? [];
}

describe("GET /c/[trackingId]", () => {
  it("302s to the merchant's URL and records a checkout_click carrying the minted row's identity", async () => {
    const seed = await seedLink();

    const res = await tap(seed.trackingId);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(DESTINATION);
    // 301 would be cached by the browser and every later click would bypass
    // us entirely, losing the measurement this endpoint exists for.
    expect(res.headers.get("cache-control")).toContain("no-store");

    const clicks = await clickEventsFor(seed.conversationId);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({
      company_id: seed.companyId,
      agent_id: seed.agentId,
      conversation_id: seed.conversationId,
      customer_id: seed.customerId,
      product_id: seed.productId,
      type: "checkout_click",
      // Null so repeat clicks never collide on the partial unique index.
      tracking_id: null,
    });
    expect(clicks[0].metadata).toEqual({ tracking_id: seed.trackingId });
  });

  it("leaves the minted product_recommendation row untouched — events are append-only", async () => {
    const seed = await seedLink();
    await tap(seed.trackingId);

    const { data: minted } = await getTestServiceClient()
      .from("events")
      .select("type, tracking_id")
      .eq("tracking_id", seed.trackingId)
      .single();

    expect(minted).toMatchObject({ type: "product_recommendation", tracking_id: seed.trackingId });
  });

  it("counts each real tap — two clicks, two rows", async () => {
    const seed = await seedLink();

    await tap(seed.trackingId);
    await tap(seed.trackingId);

    expect(await clickEventsFor(seed.conversationId)).toHaveLength(2);
  });

  it("still redirects a WhatsApp link preview, but does not count it as a click", async () => {
    const seed = await seedLink();

    const res = await tap(seed.trackingId, "WhatsApp/2.23.20.0");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(DESTINATION);
    // The whole point: WhatsApp prefetches every link it delivers, so this
    // would otherwise fake a click on every link Malu ever sends.
    expect(await clickEventsFor(seed.conversationId)).toHaveLength(0);
  });

  it("shows a friendly localized page for an unknown link, never a crash", async () => {
    const res = await tap("totally-made-up-id");

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("<html");
    // Customer-facing copy, not a stack trace or raw JSON error.
    expect(body).not.toMatch(/stack|Error:|<pre/i);
  });

  it("does not treat a checkout_click row's own id as a resolvable link", async () => {
    const seed = await seedLink();
    await tap(seed.trackingId);

    // The click row carries the id in metadata, not in tracking_id, so it can
    // never be looked up and re-redirected.
    const { data } = await getTestServiceClient()
      .from("events")
      .select("id")
      .eq("tracking_id", seed.trackingId);
    expect(data).toHaveLength(1);
  });
});
