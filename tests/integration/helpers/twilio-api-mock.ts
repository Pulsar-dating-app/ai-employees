import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type SentTwilioMessage = { accountSid: string; from: string; to: string; body: string };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });
}

function basicAuthUser(req: IncomingMessage): string {
  const header = req.headers.authorization ?? "";
  return Buffer.from(header.replace(/^Basic /, ""), "base64").toString().split(":")[0];
}

export function startTwilioApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const senders = new Map<string, { senderId: string; accountSid: string; status: string; numberKey: string }>();
  const twoFactorOn = new Set<string>();
  const registrationFailedReasons = [
    { code: "410", message: "Something went wrong. Please create a support ticket" },
    {
      code: "63112",
      message: "The Meta and/or WhatsApp Business Accounts connected to this Sender were disabled by Meta",
    },
  ];
  const describe = (sid: string) => {
    const sender = senders.get(sid)!;
    const failed = sender.status === "FAILED_TWO_FACTOR";
    return {
      sid,
      sender_id: sender.senderId,
      status: failed ? "OFFLINE" : sender.status,
      offline_reasons: failed ? registrationFailedReasons : [],
    };
  };
  const settle = (sid: string, status: string) => {
    const sender = senders.get(sid)!;
    sender.status = status;
    if (status === "ONLINE") twoFactorOn.add(sender.numberKey);
  };
  const deletedSenders: string[] = [];
  const sentMessages: SentTwilioMessage[] = [];

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };

    if (url.pathname === "/__sent" && req.method === "GET") {
      return send(200, sentMessages.filter((m) => m.to === url.searchParams.get("to")));
    }

    if (url.pathname === "/__deleted_senders" && req.method === "GET") {
      return send(200, deletedSenders);
    }

    if (url.pathname === "/__disable_two_factor" && req.method === "POST") {
      const wabaId = url.searchParams.get("waba_id") ?? "";
      for (const key of [...twoFactorOn]) if (key.startsWith(`${wabaId}|`)) twoFactorOn.delete(key);
      return send(204);
    }

    if (url.pathname === "/2010-04-01/Accounts.json" && req.method === "POST") {
      const params = new URLSearchParams(await readBody(req));
      if (params.get("FriendlyName")?.includes("trigger-subaccount-failure")) {
        return send(400, { code: 20001, message: "mock: subaccount creation failed" });
      }
      const id = randomUUID().replace(/-/g, "");
      return send(201, { sid: `AC${id}`, auth_token: `token-${id}`, friendly_name: params.get("FriendlyName") });
    }

    const messagesMatch = url.pathname.match(/^\/2010-04-01\/Accounts\/([^/]+)\/Messages\.json$/);
    if (messagesMatch && req.method === "POST") {
      const params = new URLSearchParams(await readBody(req));
      const to = params.get("To") ?? "";
      if (to.includes("trigger-send-unauthorized")) return send(401, { code: 20003, message: "mock: unauthorized" });
      if (to.includes("trigger-send-failure")) return send(500, { code: 20500, message: "mock: send failed" });
      sentMessages.push({ accountSid: messagesMatch[1], from: params.get("From") ?? "", to, body: params.get("Body") ?? "" });
      return send(201, { sid: `SM${randomUUID().replace(/-/g, "")}`, status: "queued" });
    }

    if (url.pathname === "/v2/Channels/Senders" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const wabaId: string = body?.configuration?.waba_id ?? "";
      if (wabaId.includes("trigger-sender-failure")) {
        return send(400, { code: 63110, message: "mock: sender registration failed" });
      }
      const accountType = body?.configuration?.account_type;
      if (accountType !== undefined && !["", "ISV"].includes(accountType)) {
        return send(400, { code: 63100, message: "account_type must be one of ['' ISV]" });
      }
      const sid = `XE${randomUUID().replace(/-/g, "")}`;
      const numberKey = `${wabaId}|${body.sender_id}`;
      const status = twoFactorOn.has(numberKey)
        ? "FAILED_TWO_FACTOR"
        : wabaId.includes("trigger-sender-creating")
        ? "CREATING"
        : wabaId.includes("trigger-sender-verification")
          ? "PENDING_VERIFICATION"
          : wabaId.includes("trigger-sender-offline")
            ? "OFFLINE"
            : "ONLINE";
      senders.set(sid, { senderId: body.sender_id, accountSid: basicAuthUser(req), status, numberKey });
      settle(sid, status);
      return send(201, { ...describe(sid), configuration: body.configuration, webhook: body.webhook });
    }

    const senderMatch = url.pathname.match(/^\/v2\/Channels\/Senders\/([^/]+)$/);
    if (senderMatch) {
      const sender = senders.get(senderMatch[1]);
      if (!sender || sender.accountSid !== basicAuthUser(req)) return send(404, { code: 20404, message: "mock: not found" });
      if (req.method === "DELETE") {
        senders.delete(senderMatch[1]);
        deletedSenders.push(senderMatch[1]);
        return send(204);
      }
      if (req.method === "POST") {
        const code = JSON.parse((await readBody(req)) || "{}")?.configuration?.verification_code;
        if (sender.status !== "PENDING_VERIFICATION" || code === "000000") {
          return send(400, { code: 63105, message: "mock: invalid verification code" });
        }
        settle(senderMatch[1], "VERIFYING");
        return send(200, describe(senderMatch[1]));
      }
      const next: Record<string, string> = { CREATING: "ONLINE", VERIFYING: "ONLINE", OFFLINE: "ONLINE" };
      settle(senderMatch[1], next[sender.status] ?? sender.status);
      return send(200, describe(senderMatch[1]));
    }

    send(404, { code: 20404, message: "mock: unknown endpoint" });
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
