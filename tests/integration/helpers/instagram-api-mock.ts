import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for the real Instagram/Meta endpoints in integration tests --
// same reasoning and shape as graph-api-mock.ts (the route handler under
// test runs in a separately-spawned `next dev` process, so a
// vi.spyOn(fetch) in the test process can't intercept its calls). One
// server plays both hosts (api.instagram.com for the code exchange,
// graph.instagram.com for everything after) -- meta-instagram-api.ts is
// pointed at this single URL via both INSTAGRAM_API_BASE_URL and
// INSTAGRAM_GRAPH_BASE_URL, since only the path matters to the mock.
//
// Stateless and driven entirely by request input, so tests can pick a
// failure mode just by choosing a magic value:
// - code === "trigger-token-failure" -> the short-lived code exchange fails
// - code === "trigger-exchange-failure" -> the long-lived token exchange fails
// - code === "trigger-subscribe-failure" -> the webhook subscribe step fails
// - recipient.id === "trigger-send-failure" -> POST .../messages 500s on
//   both the first attempt and the one retry (N5's sendInstagramMessage)
// - recipient.id === "trigger-send-unauthorized" -> POST .../messages 401s
//   (simulates a dead/revoked token, no retry -- only 5xx is retried)
// A short-lived token's user_id is derived from the code so a test can
// assert which IGSID a given connect attempt produced without threading
// extra state through the mock.
export function startInstagramApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/oauth/access_token" && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const params = new URLSearchParams(raw);
        const code = params.get("code") ?? "";
        if (code === "trigger-token-failure") {
          return send(400, { error_message: "mock: invalid code" });
        }
        return send(200, { access_token: `mock-short-lived-${code}`, user_id: `igid_${code}` });
      });
      return;
    }

    if (url.pathname === "/v25.0/access_token" && url.searchParams.get("grant_type") === "ig_exchange_token") {
      const shortLivedToken = url.searchParams.get("access_token") ?? "";
      if (shortLivedToken.includes("trigger-exchange-failure")) {
        return send(400, { error: { message: "mock: exchange failed" } });
      }
      return send(200, { access_token: `mock-long-lived-${shortLivedToken}`, expires_in: 5184000 });
    }

    if (url.pathname === "/refresh_access_token" && url.searchParams.get("grant_type") === "ig_refresh_token") {
      return send(200, { access_token: "mock-refreshed-token", expires_in: 5184000 });
    }

    const subscribeMatch = url.pathname.match(/^\/v25\.0\/([^/]+)\/subscribed_apps$/);
    if (subscribeMatch && req.method === "POST") {
      if (subscribeMatch[1].includes("trigger-subscribe-failure")) {
        return send(400, { error: { message: "mock: subscribe failed" } });
      }
      return send(200, { success: true });
    }

    const messagesMatch = url.pathname.match(/^\/v25\.0\/([^/]+)\/messages$/);
    if (messagesMatch && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const recipientId = JSON.parse(raw || "{}")?.recipient?.id ?? "";
        if (recipientId === "trigger-send-unauthorized") {
          return send(401, { error: { message: "mock: invalid token" } });
        }
        if (recipientId === "trigger-send-failure") {
          return send(500, { error: { message: "mock: send failed" } });
        }
        return send(200, { message_id: `mock-message-${recipientId}` });
      });
      return;
    }

    const lookupMatch = url.pathname.match(/^\/v25\.0\/([^/]+)$/);
    if (lookupMatch) {
      return send(200, { username: `user_${lookupMatch[1]}` });
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
