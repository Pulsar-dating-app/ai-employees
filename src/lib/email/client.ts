// Trello R1 -- the app's first transactional-email transport. A thin
// wrapper over Brevo's transactional email API
// (https://developers.brevo.com/reference/sendtransacemail). Deliberately
// shaped like the Instagram adapter: it never throws -- a send failure logs
// and returns { ok: false }, so a caller (a booking, a cron reminder) is
// never blocked by the mail provider being down.
//
// Switched from Resend (2026-09-09): Resend's free tier caps at 100
// emails/day, Brevo's at 300/day -- see decisions.md.
//
// BREVO_API_BASE_URL lets tests point this at a local mock instead of the
// real API, same idea as INSTAGRAM_GRAPH_BASE_URL. Read at call time (not a
// module-level const) so the spawned test server picks it up.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false };

const BREVO_ENDPOINT = "/smtp/email";

// EMAIL_FROM keeps the RFC 5322 "Name <email>" shape Resend accepted
// directly, so switching providers didn't need a config-format change too --
// Brevo just wants that split into { name, email } itself.
function parseFromAddress(raw: string): { name?: string; email: string } {
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (!match) return { email: raw.trim() };
  const name = match[1].trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.error("sendEmail: BREVO_API_KEY / EMAIL_FROM not configured -- skipping send");
    return { ok: false };
  }

  const base = process.env.BREVO_API_BASE_URL ?? "https://api.brevo.com/v3";

  try {
    const res = await fetch(`${base}${BREVO_ENDPOINT}`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: parseFromAddress(from),
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });

    if (!res.ok) {
      console.error(`sendEmail: provider returned ${res.status} -- ${await res.text().catch(() => "")}`);
      return { ok: false };
    }

    const body = (await res.json().catch(() => null)) as { messageId?: string } | null;
    return { ok: true, id: body?.messageId ?? null };
  } catch (err) {
    console.error("sendEmail: request failed", err);
    return { ok: false };
  }
}
