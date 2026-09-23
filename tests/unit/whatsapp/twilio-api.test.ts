import { afterEach, describe, expect, it, vi } from "vitest";
import { isSenderOnline, sendWhatsappMessage } from "@/lib/whatsapp/twilio/api";

// The send call is the one place Twilio's error codes get interpreted --
// which of them the caller should react to, and which are just "log it".
const credentials = { accountSid: "ACtest", authToken: "token" };
const input = { fromE164: "+14155238886", toPhone: "5511999998888", text: "oi" };

function twilioError(status: number, code: number, message = "boom") {
  return new Response(JSON.stringify({ code, message, status }), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("sendWhatsappMessage (Twilio)", () => {
  it("sends form-encoded to the subaccount's Messages endpoint with whatsapp: addresses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsappMessage(credentials, { ...input, statusCallbackUrl: "https://x.test/status" });

    expect(result).toEqual({ ok: true, messageSid: "SM123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    const form = init.body as URLSearchParams;
    expect(form.get("From")).toBe("whatsapp:+14155238886");
    expect(form.get("To")).toBe("whatsapp:+5511999998888");
    expect(form.get("Body")).toBe("oi");
    expect(form.get("StatusCallback")).toBe("https://x.test/status");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("ACtest:token").toString("base64")}`);
  });

  it("maps 63016 to outside_window and does not retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(twilioError(400, 63016));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendWhatsappMessage(credentials, input)).toEqual({ ok: false, kind: "outside_window" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 63007 to sender_offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(twilioError(400, 63007)));
    expect(await sendWhatsappMessage(credentials, input)).toEqual({ ok: false, kind: "sender_offline" });
  });

  it("maps auth failures to account_problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(twilioError(401, 20003)));
    expect(await sendWhatsappMessage(credentials, input)).toEqual({ ok: false, kind: "account_problem" });
  });

  it("retries a 5xx once, then reports 'other' with the detail for logs", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => twilioError(503, 20500, "unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendWhatsappMessage(credentials, input);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: false, kind: "other", errorDetail: "code 20500: unavailable" });
  });

  it("recovers when the retry succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(twilioError(500, 20500))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sid: "SM9" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendWhatsappMessage(credentials, input)).toEqual({ ok: true, messageSid: "SM9" });
  });

  it("turns a network failure into 'other' instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    expect(await sendWhatsappMessage(credentials, input)).toEqual({ ok: false, kind: "other", errorDetail: "ECONNRESET" });
  });
});

describe("isSenderOnline", () => {
  it("is true only for ONLINE", () => {
    expect(isSenderOnline({ status: "ONLINE" })).toBe(true);
    expect(isSenderOnline({ status: "online" })).toBe(true);
    for (const status of ["CREATING", "OFFLINE", "TWILIO_REVIEW", "UNKNOWN"]) {
      expect(isSenderOnline({ status })).toBe(false);
    }
  });
});
