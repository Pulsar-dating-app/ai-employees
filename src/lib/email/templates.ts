// Trello R1/R3/R4 -- the email bodies. One minimal branded shell, inline
// styles only (email clients strip <style>), plus a plain-text twin for
// every message. Kept intentionally small: a heading, a details block, and
// a short line about how to change the booking.

export type AppointmentEmailData = {
  businessName: string;
  serviceName: string;
  // Already formatted in the business timezone, e.g. "Thursday, 12 June at 2:00 PM".
  whenText: string;
  // Optional lines shown under the details (address, "arrive 10 min early", ...).
  businessNote: string | null;
  // How the customer reaches the business to change things.
  contact: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

function shell(headline: string, bodyHtml: string): string {
  return `<!-- staffra transactional -->
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1b1f">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 16px">${escapeHtml(headline)}</h1>
  ${bodyHtml}
</div>`;
}

function detailsHtml(data: AppointmentEmailData): string {
  const rows = [
    ["Service", data.serviceName],
    ["When", data.whenText],
    ["Business", data.businessName],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5b5b66;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:500">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const note = data.businessNote
    ? `<p style="font-size:14px;color:#5b5b66;margin:16px 0 0">${escapeHtml(data.businessNote)}</p>`
    : "";
  const contact = data.contact
    ? `<p style="font-size:14px;color:#5b5b66;margin:8px 0 0">Need to change or cancel it? ${escapeHtml(data.contact)}</p>`
    : `<p style="font-size:14px;color:#5b5b66;margin:8px 0 0">Need to change or cancel it? Just reply to the chat where you booked.</p>`;
  return `<table style="font-size:14px;border-collapse:collapse">${rows}</table>${note}${contact}`;
}

function detailsText(data: AppointmentEmailData): string {
  const lines = [
    `Service: ${data.serviceName}`,
    `When: ${data.whenText}`,
    `Business: ${data.businessName}`,
  ];
  if (data.businessNote) lines.push("", data.businessNote);
  lines.push(
    "",
    data.contact
      ? `Need to change or cancel it? ${data.contact}`
      : "Need to change or cancel it? Just reply to the chat where you booked.",
  );
  return lines.join("\n");
}

export function renderConfirmationEmail(data: AppointmentEmailData): RenderedEmail {
  return {
    subject: `Your appointment with ${data.businessName} is confirmed`,
    html: shell("You're booked ✓", `<p style="font-size:14px;margin:0 0 16px">Here are the details:</p>${detailsHtml(data)}`),
    text: `You're booked.\n\n${detailsText(data)}`,
  };
}

export function renderReminderEmail(data: AppointmentEmailData): RenderedEmail {
  return {
    subject: `Reminder: your appointment with ${data.businessName} is tomorrow`,
    html: shell(
      "See you soon 👋",
      `<p style="font-size:14px;margin:0 0 16px">A quick reminder about your appointment:</p>${detailsHtml(data)}`,
    ),
    text: `A quick reminder about your appointment.\n\n${detailsText(data)}`,
  };
}

export function renderDeclinedEmail(data: AppointmentEmailData): RenderedEmail {
  return {
    subject: `Your appointment request with ${data.businessName} couldn't be confirmed`,
    html: shell(
      "About your booking",
      `<p style="font-size:14px;margin:0 0 16px">Unfortunately ${escapeHtml(data.businessName)} couldn't confirm the ${escapeHtml(data.serviceName)} you requested for ${escapeHtml(data.whenText)}. Reply to the chat where you booked to find another time.</p>`,
    ),
    text: `Unfortunately ${data.businessName} couldn't confirm the ${data.serviceName} you requested for ${data.whenText}. Reply to the chat where you booked to find another time.`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
