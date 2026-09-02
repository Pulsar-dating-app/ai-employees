// Trello R1 -- the app's first transactional-email transport. A thin
// wrapper over Resend's REST API (https://resend.com/docs/api-reference).
// Deliberately shaped like the Instagram adapter: it never throws -- a send
// failure logs and returns { ok: false }, so a caller (a booking, a cron
// reminder) is never blocked by the mail provider being down.
//
// RESEND_API_BASE_URL lets tests point this at a local mock instead of the
// real API, same idea as INSTAGRAM_GRAPH_BASE_URL. Read at call time (not a
// module-level const) so the spawned test server picks it up.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false };

const RESEND_ENDPOINT = "/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.error("sendEmail: RESEND_API_KEY / EMAIL_FROM not configured -- skipping send");
    return { ok: false };
  }

  const base = process.env.RESEND_API_BASE_URL ?? "https://api.resend.com";

  try {
    const res = await fetch(`${base}${RESEND_ENDPOINT}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      console.error(`sendEmail: provider returned ${res.status} -- ${await res.text().catch(() => "")}`);
      return { ok: false };
    }

    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? null };
  } catch (err) {
    console.error("sendEmail: request failed", err);
    return { ok: false };
  }
}
