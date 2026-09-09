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

// Product cards (2026-09-09). Telegram has no card primitive, but
// sendMediaGroup posts an album of up to 10 photos in ONE call, and each
// item carries its own HTML caption -- so a card becomes a photo captioned
// with its name, price and a tracked link.
//
// Deliberately an album rather than N sendPhoto calls with inline
// keyboards: the keyboard version renders a nicer per-product button, but
// costs one message per product, which is the outcome cards existed to
// avoid. The trade-off is that Telegram surfaces per-item captions only
// when the customer opens a photo -- the album itself shows a photo grid.
// Accepted: the picture is the point, and every caption still carries the
// link.
const TELEGRAM_MEDIA_GROUP_MAX = 10;
const TELEGRAM_CAPTION_LIMIT = 1024;

// Telegram parses `parse_mode: "HTML"` over the whole caption, so any
// literal & < > in merchant data would break the message (or, worse, be
// read as markup). Escaped rather than stripped: a product genuinely named
// "Camiseta P&B" must survive.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type TelegramProductCard = {
  name: string;
  description: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
  url: string | null;
};

export function buildTelegramProductCaption(card: TelegramProductCard): string {
  const headline = card.priceLabel
    ? `<b>${escapeHtml(card.name)}</b> — ${escapeHtml(card.priceLabel)}`
    : `<b>${escapeHtml(card.name)}</b>`;

  const lines = [headline];
  if (card.description) lines.push(escapeHtml(card.description));
  if (card.url) lines.push(`<a href="${escapeHtml(card.url)}">Ver produto</a>`);

  return lines.join("\n").slice(0, TELEGRAM_CAPTION_LIMIT);
}

export async function sendTelegramProductCards(
  chatId: string,
  cards: readonly TelegramProductCard[],
): Promise<SendTelegramMessageResult> {
  const media = cards
    .filter((card) => card.imageUrl)
    .slice(0, TELEGRAM_MEDIA_GROUP_MAX)
    .map((card) => ({
      type: "photo" as const,
      media: card.imageUrl as string,
      caption: buildTelegramProductCaption(card),
      parse_mode: "HTML" as const,
    }));

  // Telegram rejects a media group of one, and a single photo reads better
  // as a plain sendPhoto anyway.
  if (media.length === 0) return { ok: true };
  const isAlbum = media.length > 1;

  const body = JSON.stringify(
    isAlbum
      ? { chat_id: chatId, media }
      : { chat_id: chatId, photo: media[0].media, caption: media[0].caption, parse_mode: "HTML" },
  );

  const attempt = () =>
    fetch(botApiUrl(isAlbum ? "/sendMediaGroup" : "/sendPhoto"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  let res = await attempt();
  if (!res.ok && res.status >= 500) {
    res = await attempt();
  }

  if (res.ok) return { ok: true };

  let errorDetail: string | undefined;
  try {
    const parsed = (await res.json()) as { description?: string; error_code?: number };
    errorDetail = parsed.description ? `code ${parsed.error_code}: ${parsed.description}` : `HTTP ${res.status}`;
  } catch {
    errorDetail = `HTTP ${res.status}`;
  }

  return { ok: false, errorDetail };
}
