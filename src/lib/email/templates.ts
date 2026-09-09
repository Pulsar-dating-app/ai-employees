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
    ["Serviço", data.serviceName],
    ["Quando", data.whenText],
    ["Empresa", data.businessName],
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
    ? `<p style="font-size:14px;color:#5b5b66;margin:8px 0 0">Precisa alterar ou cancelar? Fale com ${escapeHtml(data.contact)}.</p>`
    : `<p style="font-size:14px;color:#5b5b66;margin:8px 0 0">Precisa alterar ou cancelar? Basta responder na conversa onde você agendou.</p>`;
  return `<table style="font-size:14px;border-collapse:collapse">${rows}</table>${note}${contact}`;
}

function detailsText(data: AppointmentEmailData): string {
  const lines = [
    `Serviço: ${data.serviceName}`,
    `Quando: ${data.whenText}`,
    `Empresa: ${data.businessName}`,
  ];
  if (data.businessNote) lines.push("", data.businessNote);
  lines.push(
    "",
    data.contact
      ? `Precisa alterar ou cancelar? Fale com ${data.contact}.`
      : "Precisa alterar ou cancelar? Basta responder na conversa onde você agendou.",
  );
  return lines.join("\n");
}

export function renderConfirmationEmail(data: AppointmentEmailData): RenderedEmail {
  return {
    subject: `Seu agendamento com ${data.businessName} está confirmado`,
    html: shell("Agendamento confirmado ✓", `<p style="font-size:14px;margin:0 0 16px">Aqui estão os detalhes:</p>${detailsHtml(data)}`),
    text: `Agendamento confirmado.\n\n${detailsText(data)}`,
  };
}

export function renderReminderEmail(data: AppointmentEmailData): RenderedEmail {
  return {
    subject: `Lembrete: seu agendamento com ${data.businessName} é em breve`,
    html: shell(
      "Até breve 👋",
      `<p style="font-size:14px;margin:0 0 16px">Um lembrete rápido sobre seu agendamento:</p>${detailsHtml(data)}`,
    ),
    text: `Um lembrete rápido sobre seu agendamento.\n\n${detailsText(data)}`,
  };
}

export function renderDeclinedEmail(data: AppointmentEmailData): RenderedEmail {
  return {
    subject: `Seu pedido de agendamento com ${data.businessName} não pôde ser confirmado`,
    html: shell(
      "Sobre seu agendamento",
      `<p style="font-size:14px;margin:0 0 16px">Infelizmente ${escapeHtml(data.businessName)} não conseguiu confirmar o horário de ${escapeHtml(data.serviceName)} solicitado para ${escapeHtml(data.whenText)}. Responda na conversa onde você agendou para encontrar outro horário.</p>`,
    ),
    text: `Infelizmente ${data.businessName} não conseguiu confirmar o horário de ${data.serviceName} solicitado para ${data.whenText}. Responda na conversa onde você agendou para encontrar outro horário.`,
  };
}

// Trello R5 -- "a spot opened up". No details block: the waitlist is
// window-level and the slot is not held, so this is a nudge to come back to
// the chat and grab it, not a confirmation of anything.
export type WaitlistOpeningEmailData = {
  businessName: string;
  serviceName: string;
  // The freed slot's start, already formatted in the business timezone.
  whenText: string;
  // How the customer gets back to the business to claim it.
  contact: string | null;
};

export function renderWaitlistOpeningEmail(data: WaitlistOpeningEmailData): RenderedEmail {
  const how = data.contact
    ? `Entre em contato para garantir: ${data.contact}.`
    : "Responda na conversa onde você pediu, e a gente te agenda.";
  const line =
    `Boa notícia -- uma vaga de ${data.serviceName} acabou de abrir em ${data.businessName}, ` +
    `em ${data.whenText}. Ela não está reservada, então é por ordem de chegada. ${how}`;
  return {
    subject: `Uma vaga de ${data.serviceName} abriu em ${data.businessName}`,
    html: shell(
      "Uma vaga acabou de abrir 🎉",
      `<p style="font-size:14px;margin:0">${escapeHtml(line)}</p>`,
    ),
    text: line,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
