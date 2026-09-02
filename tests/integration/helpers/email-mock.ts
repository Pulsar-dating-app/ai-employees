import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for the Resend API (POST /emails) in integration tests -- same
// reasoning as graph-api-mock.ts / instagram-api-mock.ts: the route under
// test runs in a separately-spawned `next dev` process, so an in-process
// fetch spy can't intercept its calls. Captures every send; a test reads
// them back via the returned `sent()`.
//
// A `to` of "trigger-email-failure@example.test" makes the mock 500 once,
// so a test can exercise sendEmail's { ok: false } path.

export type CapturedEmail = { to: string; subject: string; html: string; text: string };

export function startEmailMock(): Promise<{
  url: string;
  sent: () => CapturedEmail[];
  clear: () => void;
  stop: () => Promise<void>;
}> {
  const captured: CapturedEmail[] = [];

  const server: Server = createServer((req, res) => {
    // The spawned next-dev process posts here; the test workers (separate
    // processes) read the captures back over these two endpoints.
    if (req.url?.endsWith("/__sent")) {
      if (req.method === "DELETE") {
        captured.length = 0;
        res.writeHead(204).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(captured));
      return;
    }
    if (req.method !== "POST" || !req.url?.endsWith("/emails")) {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as CapturedEmail;
      if (body.to === "trigger-email-failure@example.test") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "mock: send failed" }));
        return;
      }
      captured.push({ to: body.to, subject: body.subject, html: body.html, text: body.text });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `mock-email-${captured.length}` }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        sent: () => captured.slice(),
        clear: () => {
          captured.length = 0;
        },
        stop: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
