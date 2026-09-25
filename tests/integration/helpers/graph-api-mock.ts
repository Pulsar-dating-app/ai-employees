import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for the real Meta Graph API in integration tests. The route
// handler under test runs in a separately-spawned `next dev` process (see
// global-setup.ts), so a `vi.spyOn(fetch)` in the test process can't
// intercept its calls -- this is a real local HTTP server instead, wired in
// via META_GRAPH_API_BASE_URL.
//
// Stateless and driven entirely by request input, so tests can pick a
// failure mode just by choosing a magic value, without any shared mutable
// state across (possibly concurrent) tests:
// - code === "trigger-token-failure" -> the token exchange step fails
// - phoneNumberId === "trigger-register-failure" -> the register step fails
// - wabaId === "trigger-subscribe-failure" -> the webhook subscribe step fails
// - to === "trigger-send-failure" -> POST .../messages 500s on both the
//   first attempt and the one retry (D4's sendWhatsappMessage)
// - to === "trigger-send-unauthorized" -> POST .../messages 401s (dead
//   token, no retry -- only 5xx is retried)
// - to === "trigger-payment-issue" -> POST .../messages 400s with Meta's
//   131042 error envelope (D5's PAYMENT_ISSUE_ERROR_CODE)
// - phoneNumberId (in the GET lookup path) === "trigger-payment-issue" ->
//   the plain lookup also 400s with 131042, so D5's checkWhatsappEligibility
//   can be tested against the same magic value
export function startGraphApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/v21.0/oauth/access_token") {
      const code = url.searchParams.get("code");
      if (code === "trigger-token-failure") {
        return send(400, { error: { message: "mock: invalid code" } });
      }
      return send(200, { access_token: "mock-access-token", token_type: "bearer", expires_in: 5184000 });
    }

    const registerMatch = url.pathname.match(/^\/v21\.0\/([^/]+)\/register$/);
    if (registerMatch) {
      if (registerMatch[1] === "trigger-register-failure") {
        return send(400, { error: { message: "mock: registration failed" } });
      }
      return send(200, { success: true });
    }

    const subscribeMatch = url.pathname.match(/^\/v21\.0\/([^/]+)\/subscribed_apps$/);
    if (subscribeMatch) {
      if (subscribeMatch[1] === "trigger-subscribe-failure") {
        return send(400, { error: { message: "mock: subscribe failed" } });
      }
      return send(200, { success: true });
    }

    const messagesMatch = url.pathname.match(/^\/v21\.0\/([^/]+)\/messages$/);
    if (messagesMatch && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(raw || "{}");
        const to = parsed?.to ?? "";
        if (to === "trigger-send-unauthorized") {
          return send(401, { error: { message: "mock: invalid token", code: 190 } });
        }
        if (to === "trigger-send-failure") {
          return send(500, { error: { message: "mock: send failed" } });
        }
        if (to === "trigger-payment-issue") {
          return send(400, {
            error: { message: "mock: business eligibility payment issue", code: 131042, error_subcode: 2593109 },
          });
        }
        return send(200, { messages: [{ id: `mock-message-${to}` }] });
      });
      return;
    }

    const phoneMatch = url.pathname.match(/^\/v21\.0\/([^/]+)$/);
    if (phoneMatch) {
      if (phoneMatch[1] === "trigger-payment-issue") {
        return send(400, {
          error: { message: "mock: business eligibility payment issue", code: 131042, error_subcode: 2593109 },
        });
      }
      return send(200, { id: phoneMatch[1], display_phone_number: "+55 11 91234-5678" });
    }

    send(404, { error: { message: "mock: unknown endpoint" } });
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
