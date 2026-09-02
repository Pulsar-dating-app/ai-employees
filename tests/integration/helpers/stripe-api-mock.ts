import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getPlan, type PlanKey } from "@/lib/billing/plans";

// Stands in for the real Stripe API in integration tests. The billing
// checkout route under test runs in the separately-spawned `next dev`
// process (global-setup.ts), so a fetch spy in the vitest process can't
// intercept its calls -- this is a real local HTTP server, wired in via
// STRIPE_API_BASE_URL (the `stripe` SDK's own host/port/protocol config).
//
// Stateless and driven entirely by request input, like graph-api-mock.ts:
//  - customer email containing "trigger-customer-failure" -> 400
//  - checkout session create WITH a `currency` param -> 400 (proves the
//    route never sets one -- Adaptive Pricing owns presentment)
//  - billing portal session create -> echoes a hosted url (existing
//    subscribers are sent here for plan changes, not subscriptions.update)
//  - subscription update WITHOUT proration_behavior=create_prorations -> 400
//    (kept for P4; P3 no longer calls it)
//  - GET /v1/subscriptions/sub_mock_<planKey> reports that plan's real
//    Price id as the current item (used by P4).

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}

function extractMetadata(params: URLSearchParams): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of params) {
    const match = key.match(/^metadata\[(.+)\]$/);
    if (match) metadata[match[1]] = value;
  }
  return metadata;
}

// P4 test sub ids: `sub_mock_<planKey>[__co_<companyId>]`. The plan half
// drives the returned price/lookup_key; the optional company half is echoed
// as metadata.companyId, the way a real subscription created through P3's
// checkout carries it (so the webhook handler resolves the company without
// the non-unique stripe_subscription_id fallback).
function parseSubMock(subscriptionId: string): { planKey: PlanKey | null; companyId: string | null } {
  const planMatch = subscriptionId.match(/^sub_mock_(starter|pro|enterprise)/);
  const coMatch = subscriptionId.match(/__co_(.+)$/);
  return {
    planKey: planMatch ? (planMatch[1] as PlanKey) : null,
    companyId: coMatch ? coMatch[1] : null,
  };
}

function priceForSubscription(subscriptionId: string): { id: string; lookup_key: string | null } {
  const { planKey } = parseSubMock(subscriptionId);
  if (planKey) {
    const plan = getPlan(planKey);
    if (plan.stripePriceId) return { id: plan.stripePriceId, lookup_key: plan.stripeLookupKey };
  }
  return { id: "price_mock_unknown_current", lookup_key: null };
}

function mockSubscription(subscriptionId: string) {
  const nowSec = Math.floor(Date.now() / 1000);
  const { companyId } = parseSubMock(subscriptionId);
  return {
    id: subscriptionId,
    object: "subscription",
    status: "active",
    cancel_at_period_end: false,
    customer: `cus_mock_of_${subscriptionId}`,
    metadata: companyId ? { companyId } : {},
    items: {
      object: "list",
      data: [
        {
          id: "si_mock_1",
          object: "subscription_item",
          current_period_start: nowSec,
          current_period_end: nowSec + 30 * 24 * 3600,
          price: { object: "price", ...priceForSubscription(subscriptionId) },
        },
      ],
    },
  };
}

export function startStripeApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const fail = (message: string) =>
      send(400, { error: { type: "invalid_request_error", message: `mock: ${message}` } });

    const body = req.method === "GET" ? "" : await readBody(req);
    const params = new URLSearchParams(body);

    // --- Customers -------------------------------------------------------
    if (req.method === "POST" && url.pathname === "/v1/customers") {
      const email = params.get("email") ?? "";
      if (email.includes("trigger-customer-failure")) return fail("customer create failed");
      return send(200, {
        id: randomId("cus_mock"),
        object: "customer",
        email: email || null,
        name: params.get("name") ?? null,
        metadata: extractMetadata(params),
      });
    }

    // --- Checkout Sessions --------------------------------------------------
    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      if (params.has("currency")) {
        return fail("currency must not be set on the session (Adaptive Pricing owns presentment)");
      }
      const id = randomId("cs_mock");
      return send(200, {
        id,
        object: "checkout.session",
        mode: params.get("mode"),
        customer: params.get("customer"),
        url: `https://checkout.stripe.test/c/${id}`,
        metadata: extractMetadata(params),
      });
    }

    // --- Billing Portal ------------------------------------------------
    if (req.method === "POST" && url.pathname === "/v1/billing_portal/sessions") {
      const id = randomId("bps_mock");
      return send(200, {
        id,
        object: "billing_portal.session",
        customer: params.get("customer"),
        return_url: params.get("return_url"),
        url: `https://billing.stripe.test/p/session/${id}`,
      });
    }

    // --- Subscriptions ---------------------------------------------------
    const subMatch = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (subMatch) {
      const subscriptionId = subMatch[1];
      if (req.method === "GET") {
        // P4 retrieves the subscription on checkout.session.completed and
        // invoice.paid. Status/period/lookup_key come from the sub id shape
        // (sub_mock_<planKey>); other events carry the subscription in the
        // event payload and never hit this.
        return send(200, mockSubscription(subscriptionId));
      }
      if (req.method === "DELETE") {
        // P4's one-active-subscription guard cancels a superseded sub.
        return send(200, { ...mockSubscription(subscriptionId), status: "canceled" });
      }
      if (req.method === "POST") {
        // Not used by P3 (Portal) or P4; kept as a guard in case a swap is
        // ever wired in our code again.
        if (params.get("proration_behavior") !== "create_prorations") {
          return fail("subscription update must pass proration_behavior=create_prorations");
        }
        return send(200, {
          ...mockSubscription(subscriptionId),
          items: {
            object: "list",
            data: [
              {
                id: "si_mock_1",
                object: "subscription_item",
                price: { id: params.get("items[0][price]"), object: "price" },
              },
            ],
          },
        });
      }
    }

    send(404, { error: { type: "invalid_request_error", message: "mock: unknown endpoint" } });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
