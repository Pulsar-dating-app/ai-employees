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

    const phoneMatch = url.pathname.match(/^\/v21\.0\/([^/]+)$/);
    if (phoneMatch) {
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
