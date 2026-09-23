import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for the real Twilio REST APIs (Accounts, Senders v2, Messages) in
// integration tests -- same reasoning as graph-api-mock.ts: the route handlers
// under test run in a separately-spawned `next dev` process, so an in-process
// fetch spy can't intercept them. Wired in via TWILIO_API_BASE_URL and
// TWILIO_MESSAGING_BASE_URL (both point at this one server) in global-setup.ts.
//
// Unlike graph-api-mock this one is stateful in one narrow way -- a `requests`
// log the tests can read back through GET /__requests -- because the most
// important thing to assert on a send is *what* was sent (From/To/Body) and
// with *which* credentials, and the sending happens inside the Next process.
// Every log entry is keyed by the request itself, so concurrent tests just
// filter for their own values.
//
// Failure modes are picked by magic values in the request, no shared config:
// - Accounts: FriendlyName containing "trigger-subaccount-failure" -> 500
// - Senders POST: sender_id containing "5500000000" (a +5500000000xx number)
//   -> 400 Twilio error 63101 (WABA problem); profile.name "trigger-online"
//   -> the sender comes back ONLINE immediately, anything else -> CREATING
// - Senders GET/DELETE: sid ending "-online" -> ONLINE, "-offline" -> OFFLINE,
//   anything else -> CREATING. DELETE of a sid ending "-fail-delete" -> 500.
// - Messages: To "whatsapp:+5500000000001" -> 400 error 63016 (outside window),
//   "...002" -> 400 error 63007 (sender not found), "...003" -> 401 error
//   20003 (auth failed), "...004" -> 500 (both attempts)
export interface TwilioMockRequest {
  method: string;
  path: string;
  authorization: string | null;
  // Parsed body: form fields for Accounts/Messages, JSON for Senders.
  body: Record<string, unknown>;
}

export function startTwilioApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const requests: TwilioMockRequest[] = [];
  let subaccountCounter = 0;
  let senderCounter = 0;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const twilioError = (status: number, code: number, message: string) => send(status, { code, message, status });

    if (url.pathname === "/__requests") return send(200, requests);

    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const contentType = req.headers["content-type"] ?? "";
      let body: Record<string, unknown> = {};
      if (raw) {
        body = contentType.includes("application/json")
          ? JSON.parse(raw)
          : Object.fromEntries(new URLSearchParams(raw).entries());
      }
      requests.push({ method: req.method ?? "GET", path: url.pathname, authorization: req.headers.authorization ?? null, body });

      // POST /2010-04-01/Accounts.json -- create subaccount
      if (url.pathname === "/2010-04-01/Accounts.json" && req.method === "POST") {
        if (String(body.FriendlyName ?? "").includes("trigger-subaccount-failure")) {
          return twilioError(500, 20500, "mock: subaccount creation failed");
        }
        subaccountCounter += 1;
        return send(201, {
          sid: `ACmocksub${String(subaccountCounter).padStart(4, "0")}${Date.now().toString(16)}`,
          auth_token: `mock-sub-token-${subaccountCounter}-${Date.now().toString(16)}`,
          friendly_name: body.FriendlyName,
          status: "active",
        });
      }

      // POST /2010-04-01/Accounts/{sid}/Messages.json -- send
      if (/^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(url.pathname) && req.method === "POST") {
        const to = String(body.To ?? "");
        if (to === "whatsapp:+5500000000001") return twilioError(400, 63016, "mock: outside the allowed window");
        if (to === "whatsapp:+5500000000002") return twilioError(400, 63007, "mock: no channel for From");
        if (to === "whatsapp:+5500000000003") return twilioError(401, 20003, "mock: authenticate");
        if (to === "whatsapp:+5500000000004") return twilioError(500, 20500, "mock: internal error");
        return send(201, { sid: `SMmock${Date.now().toString(16)}`, status: "queued" });
      }

      // POST /v2/Channels/Senders -- register a sender
      if (url.pathname === "/v2/Channels/Senders" && req.method === "POST") {
        const senderId = String((body as { sender_id?: string }).sender_id ?? "");
        if (senderId.includes("5500000000")) return twilioError(400, 63101, "mock: WABA ID provided is not valid");
        senderCounter += 1;
        const name = (body as { profile?: { name?: string } }).profile?.name;
        const online = name === "trigger-online";
        return send(201, {
          sid: `XEmock${String(senderCounter).padStart(4, "0")}${Date.now().toString(16)}${online ? "-online" : ""}`,
          status: online ? "ONLINE" : "CREATING",
          sender_id: senderId,
        });
      }

      const senderMatch = url.pathname.match(/^\/v2\/Channels\/Senders\/([^/]+)$/);
      if (senderMatch) {
        const sid = senderMatch[1];
        if (req.method === "DELETE") {
          if (sid.endsWith("-fail-delete")) return twilioError(500, 20500, "mock: delete failed");
          res.writeHead(204);
          return res.end();
        }
        if (req.method === "GET") {
          const status = sid.endsWith("-online") ? "ONLINE" : sid.endsWith("-offline") ? "OFFLINE" : "CREATING";
          return send(200, {
            sid,
            status,
            properties: status === "ONLINE" ? { quality_rating: "GREEN", messaging_limit: "TIER_1K" } : {},
          });
        }
      }

      return send(404, { code: 20404, message: `mock: no route for ${req.method} ${url.pathname}`, status: 404 });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
