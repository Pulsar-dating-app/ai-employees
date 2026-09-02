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

function currentPriceIdForSubscription(subscriptionId: string): string {
  const match = subscriptionId.match(/^sub_mock_(starter|pro|enterprise)$/);
  if (match) {
    const priceId = getPlan(match[1] as PlanKey).stripePriceId;
    if (priceId) return priceId;
  }
  return "price_mock_unknown_current";
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
        return send(200, {
          id: subscriptionId,
          object: "subscription",
          status: "active",
          items: {
            object: "list",
            data: [
              {
                id: "si_mock_1",
                object: "subscription_item",
                price: { id: currentPriceIdForSubscription(subscriptionId), object: "price" },
              },
            ],
          },
        });
      }
      if (req.method === "POST") {
        if (params.get("proration_behavior") !== "create_prorations") {
          return fail("subscription update must pass proration_behavior=create_prorations");
        }
        return send(200, {
          id: subscriptionId,
          object: "subscription",
          status: "active",
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
