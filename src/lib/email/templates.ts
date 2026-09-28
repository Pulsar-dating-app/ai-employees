// Trello R1/R3/R4 -- the email bodies. One minimal branded shell, inline
// styles only (email clients strip <style>), plus a plain-text twin for
// every message. Kept intentionally small: a heading, a details block, and
// a short line about how to change the booking.

export type AppointmentEmailData = {
  businessName: string;
  serviceName: string;
  // Who the appointment is with -- only set when the business has more than
  // one professional (a solo business never names its professional).
  professionalName?: string | null;
  // Already formatted in the business timezone, e.g. "Thursday, 12 June at 2:00 PM".
  whenText: string;
  // Optional lines shown under the details (address, "arrive 10 min early", ...).
  businessNote: string | null;
  // How the customer reaches the business to change things.
  contact: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export type EmailLanguage = "pt" | "en" | "it";

const COPY = {
  pt: {
    service: "Serviço",
    professional: "Profissional",
    when: "Quando",
    business: "Empresa",
    changeVia: (contact: string) => `Precisa alterar ou cancelar? Fale com ${contact}.`,
    changeInChat: "Precisa alterar ou cancelar? Basta responder na conversa onde você agendou.",
    confirmedSubject: (b: string) => `Seu agendamento com ${b} está confirmado`,
    confirmedHeadline: "Agendamento confirmado ✓",
    confirmedIntro: "Aqui estão os detalhes:",
    confirmedText: "Agendamento confirmado.",
    reminderSubject: (b: string) => `Lembrete: seu agendamento com ${b} é em breve`,
    reminderHeadline: "Até breve 👋",
    reminderIntro: "Um lembrete rápido sobre seu agendamento:",
    reminderText: "Um lembrete rápido sobre seu agendamento.",
    declinedSubject: (b: string) => `Seu pedido de agendamento com ${b} não pôde ser confirmado`,
    declinedHeadline: "Sobre seu agendamento",
    declinedBody: (b: string, s: string, w: string) =>
      `Infelizmente ${b} não conseguiu confirmar o horário de ${s} solicitado para ${w}. Responda na conversa onde você agendou para encontrar outro horário.`,
    fallbackService: "seu agendamento",
  },
  en: {
    service: "Service",
    professional: "With",
    when: "When",
    business: "Business",
    changeVia: (contact: string) => `Need to change or cancel? Contact ${contact}.`,
    changeInChat: "Need to change or cancel? Just reply in the conversation where you booked.",
    confirmedSubject: (b: string) => `Your appointment with ${b} is confirmed`,
    confirmedHeadline: "Appointment confirmed ✓",
    confirmedIntro: "Here are the details:",
    confirmedText: "Appointment confirmed.",
    reminderSubject: (b: string) => `Reminder: your appointment with ${b} is coming up`,
    reminderHeadline: "See you soon 👋",
    reminderIntro: "A quick reminder about your appointment:",
    reminderText: "A quick reminder about your appointment.",
    declinedSubject: (b: string) => `Your appointment request with ${b} couldn't be confirmed`,
    declinedHeadline: "About your appointment",
    declinedBody: (b: string, s: string, w: string) =>
      `Unfortunately ${b} couldn't confirm the ${s} appointment you requested for ${w}. Reply in the conversation where you booked to find another time.`,
    fallbackService: "your appointment",
  },
  it: {
    service: "Servizio",
    professional: "Con",
    when: "Quando",
    business: "Attività",
    changeVia: (contact: string) => `Devi modificare o disdire? Contatta ${contact}.`,
    changeInChat: "Devi modificare o disdire? Rispondi nella conversazione in cui hai prenotato.",
    confirmedSubject: (b: string) => `Il tuo appuntamento con ${b} è confermato`,
    confirmedHeadline: "Appuntamento confermato ✓",
    confirmedIntro: "Ecco i dettagli:",
    confirmedText: "Appuntamento confermato.",
    reminderSubject: (b: string) => `Promemoria: il tuo appuntamento con ${b} si avvicina`,
    reminderHeadline: "A presto 👋",
    reminderIntro: "Un breve promemoria sul tuo appuntamento:",
    reminderText: "Un breve promemoria sul tuo appuntamento.",
    declinedSubject: (b: string) => `La tua richiesta di appuntamento con ${b} non è stata confermata`,
    declinedHeadline: "Sul tuo appuntamento",
    declinedBody: (b: string, s: string, w: string) =>
      `Purtroppo ${b} non ha potuto confermare l'appuntamento per ${s} richiesto per ${w}. Rispondi nella conversazione in cui hai prenotato per trovare un altro orario.`,
    fallbackService: "il tuo appuntamento",
  },
} as const;

export function fallbackServiceName(language: EmailLanguage): string {
  return COPY[language].fallbackService;
}

function shell(headline: string, bodyHtml: string): string {
  return `<!-- staffra transactional -->
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1b1f">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 16px">${escapeHtml(headline)}</h1>
  ${bodyHtml}
</div>`;
}

function detailRows(data: AppointmentEmailData, language: EmailLanguage): [string, string][] {
  const c = COPY[language];
  return [
    [c.service, data.serviceName],
    ...(data.professionalName ? [[c.professional, data.professionalName] as [string, string]] : []),
    [c.when, data.whenText],
    [c.business, data.businessName],
  ];
}

function changeLine(data: AppointmentEmailData, language: EmailLanguage): string {
  return data.contact ? COPY[language].changeVia(data.contact) : COPY[language].changeInChat;
}

function detailsHtml(data: AppointmentEmailData, language: EmailLanguage): string {
  const rows = detailRows(data, language)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5b5b66;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:500">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const note = data.businessNote
    ? `<p style="font-size:14px;color:#5b5b66;margin:16px 0 0">${escapeHtml(data.businessNote)}</p>`
    : "";
  const contact = `<p style="font-size:14px;color:#5b5b66;margin:8px 0 0">${escapeHtml(changeLine(data, language))}</p>`;
  return `<table style="font-size:14px;border-collapse:collapse">${rows}</table>${note}${contact}`;
}

function detailsText(data: AppointmentEmailData, language: EmailLanguage): string {
  const lines = detailRows(data, language).map(([k, v]) => `${k}: ${v}`);
  if (data.businessNote) lines.push("", data.businessNote);
  lines.push("", changeLine(data, language));
  return lines.join("\n");
}

export function renderConfirmationEmail(data: AppointmentEmailData, language: EmailLanguage = "pt"): RenderedEmail {
  const c = COPY[language];
  return {
    subject: c.confirmedSubject(data.businessName),
    html: shell(c.confirmedHeadline, `<p style="font-size:14px;margin:0 0 16px">${escapeHtml(c.confirmedIntro)}</p>${detailsHtml(data, language)}`),
    text: `${c.confirmedText}\n\n${detailsText(data, language)}`,
  };
}

export function renderReminderEmail(data: AppointmentEmailData, language: EmailLanguage = "pt"): RenderedEmail {
  const c = COPY[language];
  return {
    subject: c.reminderSubject(data.businessName),
    html: shell(c.reminderHeadline, `<p style="font-size:14px;margin:0 0 16px">${escapeHtml(c.reminderIntro)}</p>${detailsHtml(data, language)}`),
    text: `${c.reminderText}\n\n${detailsText(data, language)}`,
  };
}

export function renderDeclinedEmail(data: AppointmentEmailData, language: EmailLanguage = "pt"): RenderedEmail {
  const c = COPY[language];
  const body = c.declinedBody(data.businessName, data.serviceName, data.whenText);
  return {
    subject: c.declinedSubject(data.businessName),
    html: shell(
      c.declinedHeadline,
      `<p style="font-size:14px;margin:0 0 16px">${c.declinedBody(escapeHtml(data.businessName), escapeHtml(data.serviceName), escapeHtml(data.whenText))}</p>`,
    ),
    text: body,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
