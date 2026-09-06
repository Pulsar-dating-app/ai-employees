// Shared Telegram Bot API calls for Trello O1. One bot for the whole app
// (a single @BotFather token, TELEGRAM_BOT_TOKEN) -- unlike WhatsApp/
// Instagram, there is no per-merchant asset or connect flow here, so this
// file has no "connect"/"finish" functions, only delivery.
//
// TELEGRAM_API_BASE_URL lets tests point this at a local mock instead of
// the real Telegram Bot API, same convention as META_GRAPH_API_BASE_URL/
// INSTAGRAM_API_BASE_URL (the spawned test Next.js server can't share an
// in-process fetch mock with the test runner -- see tests/integration/global-setup.ts).
const API_BASE_URL = process.env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org";

function botApiUrl(path: string) {
  return `${API_BASE_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}${path}`;
}

// Trello O1 -- delivery, the other end of the inbound webhook. No template
// categories, no session-window restriction, no per-message cost -- unlike
// WhatsApp/Instagram, there's no distinct "payment_issue"-shaped outcome to
// model here, just success or a logged failure. `errorDetail` is for
// server-side logs only, same convention as sendWhatsappMessage's (never
// shown to a merchant).
export type SendTelegramMessageResult = { ok: true } | { ok: false; errorDetail?: string };

export async function sendTelegramMessage(chatId: string, text: string): Promise<SendTelegramMessageResult> {
  const body = JSON.stringify({ chat_id: chatId, text });

  const attempt = () =>
    fetch(botApiUrl("/sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  let res = await attempt();
  // Retry once on a transient failure only -- a 4xx (bad chat id, bot
  // blocked by the user) will fail identically on retry.
  if (!res.ok && res.status >= 500) {
    res = await attempt();
  }

  if (res.ok) return { ok: true };

  let errorDetail: string | undefined;
  try {
    const body = (await res.json()) as { description?: string; error_code?: number };
    errorDetail = body.description ? `code ${body.error_code}: ${body.description}` : `HTTP ${res.status}`;
  } catch {
    errorDetail = `HTTP ${res.status}`;
  }

  return { ok: false, errorDetail };
}
