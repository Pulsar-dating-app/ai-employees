import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for Google's real oauth2.googleapis.com/token endpoint in
// integration tests. Same reasoning as graph-api-mock.ts: the route handler
// under test runs in a separately-spawned `next dev` process, so a
// vi.spyOn(fetch) in the test process can't intercept its calls -- this is a
// real local HTTP server instead, wired in via GOOGLE_OAUTH_TOKEN_URL.
//
// Stateless and driven entirely by the `code` param, so tests can pick a
// scenario just by choosing a magic value:
// - code === "trigger-token-failure" -> the exchange fails outright
// - code === "good-code-no-refresh" -> succeeds but omits refresh_token,
//   simulating a real reconnect that didn't force prompt=consent
// - anything else -> succeeds with a fresh refresh_token
export function startGoogleOAuthMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const params = new URLSearchParams(raw);
      const code = params.get("code");

      if (code === "trigger-token-failure") {
        return send(400, { error: "invalid_grant", error_description: "mock: invalid code" });
      }

      const base = {
        access_token: "mock-google-access-token",
        token_type: "Bearer",
        expires_in: 3599,
        scope: "https://www.googleapis.com/auth/calendar",
      };

      if (code === "good-code-no-refresh") {
        return send(200, base);
      }

      return send(200, { ...base, refresh_token: "mock-google-refresh-token" });
    });
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
