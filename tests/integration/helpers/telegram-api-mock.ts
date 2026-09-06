import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for the real Telegram Bot API in integration tests -- same
// reasoning and shape as graph-api-mock.ts/instagram-api-mock.ts (the route
// handler under test runs in a separately-spawned `next dev` process, so a
// vi.spyOn(fetch) in the test process can't intercept its calls).
//
// Stateless and driven entirely by request input:
// - chat_id === "trigger-send-failure" -> 500s on both the first attempt
//   and the one retry (sendTelegramMessage)
// - chat_id === "trigger-send-unauthorized" -> 403 (simulates the bot being
//   blocked by the user, no retry -- only 5xx is retried)
export function startTelegramApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname.endsWith("/sendMessage") && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(raw || "{}");
        const chatId = String(parsed?.chat_id ?? "");
        if (chatId === "trigger-send-unauthorized") {
          return send(403, { ok: false, error_code: 403, description: "mock: bot was blocked by the user" });
        }
        if (chatId === "trigger-send-failure") {
          return send(500, { ok: false, error_code: 500, description: "mock: send failed" });
        }
        return send(200, { ok: true, result: { message_id: Math.floor(Math.random() * 1e6) } });
      });
      return;
    }

    send(404, { ok: false, description: "mock: unknown endpoint" });
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
