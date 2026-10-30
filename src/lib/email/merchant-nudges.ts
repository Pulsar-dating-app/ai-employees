// The merchant nudge e-mails (cron /api/cron/merchant-nudges). Branded with
// the logo and the hire's photo, unlike the appointment e-mails. Written to the account owner about their own
// setup, so it reads like a note from the product, never a campaign, and it
// says why they got it.
import { escapeHtml, type EmailLanguage, type RenderedEmail } from "./templates";
import type { NudgeKind } from "@/lib/nudges/kinds";

export type MerchantNudgeData = {
  ownerName: string | null;
  companyName: string;
  // Null when they stopped before hiring anyone.
  agentName: string | null;
  scheduling: boolean;
  // The hire's hosted chat link, for not_live.
  chatUrl: string | null;
  // Where the button goes: the click-tracking route, which forwards to the dashboard.
  ctaUrl: string;
  baseUrl: string;
  agentSlug: string | null;
};

const COPY = {
  pt: {
    hi: (n: string | null) => (n ? `Oi, ${n}!` : "Oi!"),
    stalledSubject: (a: string | null) =>
      a ? `Falta pouco para a ${a} começar a atender` : "Falta pouco para começar a atender seus clientes",
    stalledHeadline: (a: string | null) => (a ? `A ${a} está quase pronta` : "Falta pouco"),
    stalledBody: (c: string) =>
      `Você começou a configurar o atendimento da ${c} no Staffra e parou no meio do caminho. Faltam só alguns minutos: é continuar de onde parou.`,
    stalledCta: "Continuar de onde parei",
    liveSubject: (a: string) => `A ${a} está pronta, só falta o link chegar nos seus clientes`,
    liveHeadline: (a: string) => `A ${a} ainda não conversou com nenhum cliente`,
    liveBody: (a: string, c: string, scheduling: boolean) =>
      `Ela já conhece ${scheduling ? "os serviços e horários" : "os produtos"} da ${c}. Para começar, seus clientes só precisam do link da ${a}:`,
    linkLabel: (a: string) => `Link da ${a}`,
    liveHow: "Cole na bio do Instagram ou na mensagem de saudação do WhatsApp Business. Leva um minuto.",
    liveCta: "Abrir meu painel",
    footer: "Você recebeu este e-mail porque criou uma conta no Staffra. É uma mensagem única sobre a configuração da sua conta.",
  },
  en: {
    hi: (n: string | null) => (n ? `Hi ${n}!` : "Hi!"),
    stalledSubject: (a: string | null) =>
      a ? `${a} is almost ready to answer your customers` : "You're almost ready to answer your customers",
    stalledHeadline: (a: string | null) => (a ? `${a} is almost ready` : "Almost there"),
    stalledBody: (c: string) =>
      `You started setting up customer service for ${c} on Staffra and stopped halfway. It only takes a few more minutes: just pick up where you left off.`,
    stalledCta: "Pick up where I left off",
    liveSubject: (a: string) => `${a} is ready — your customers just need the link`,
    liveHeadline: (a: string) => `${a} hasn't talked to any customers yet`,
    liveBody: (a: string, c: string, scheduling: boolean) =>
      `She already knows ${c}'s ${scheduling ? "services and hours" : "products"}. To get started, your customers only need ${a}'s link:`,
    linkLabel: (a: string) => `${a}'s link`,
    liveHow: "Put it in your Instagram bio or your WhatsApp Business greeting message. It takes a minute.",
    liveCta: "Open my dashboard",
    footer: "You're getting this e-mail because you created a Staffra account. It's a one-off message about setting up your account.",
  },
  it: {
    hi: (n: string | null) => (n ? `Ciao ${n}!` : "Ciao!"),
    stalledSubject: (a: string | null) =>
      a ? `Manca poco perché ${a} inizi a rispondere` : "Manca poco per rispondere ai tuoi clienti",
    stalledHeadline: (a: string | null) => (a ? `${a} è quasi pronta` : "Manca poco"),
    stalledBody: (c: string) =>
      `Hai iniziato a configurare l'assistenza clienti di ${c} su Staffra e ti sei fermato a metà. Bastano pochi minuti: riprendi da dove avevi lasciato.`,
    stalledCta: "Riprendi da dove avevo lasciato",
    liveSubject: (a: string) => `${a} è pronta, ai tuoi clienti serve solo il link`,
    liveHeadline: (a: string) => `${a} non ha ancora parlato con nessun cliente`,
    liveBody: (a: string, c: string, scheduling: boolean) =>
      `Conosce già ${scheduling ? "i servizi e gli orari" : "i prodotti"} di ${c}. Per iniziare, ai tuoi clienti serve solo il link di ${a}:`,
    linkLabel: (a: string) => `Il link di ${a}`,
    liveHow: "Mettilo nella bio di Instagram o nel messaggio di benvenuto di WhatsApp Business. Ci vuole un minuto.",
    liveCta: "Apri la mia dashboard",
    footer: "Ricevi questa e-mail perché hai creato un account Staffra. È un messaggio unico sulla configurazione del tuo account.",
  },
} satisfies Record<EmailLanguage, unknown>;

// No stored language for a merchant; the business's country is the best
// signal there is. Brazil-first, so an unset country reads Portuguese.
export function merchantEmailLanguage(country: string | null): EmailLanguage {
  if (!country || country === "BR" || country === "PT") return "pt";
  if (country === "IT") return "it";
  return "en";
}

const P = "font-size:15px;line-height:1.6;margin:0 0 16px;color:#1b1b1f";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const AGENT_EMAIL_PHOTOS: Record<string, string> = { ana: "/email/ana.png", malu: "/email/malu.png" };

function asset(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function layout(data: MerchantNudgeData, headline: string, bodyHtml: string, footerText: string): string {
  const photo = data.agentSlug && data.agentName ? AGENT_EMAIL_PHOTOS[data.agentSlug] : undefined;
  const heading = `<h1 style="font-size:20px;line-height:1.3;font-weight:700;margin:0;color:#1b1b1f">${escapeHtml(headline)}</h1>`;
  const headingRow = photo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>` +
      `<td style="vertical-align:middle;padding-right:14px"><img src="${escapeHtml(asset(data.baseUrl, photo))}" width="56" height="56" alt="${escapeHtml(data.agentName ?? "")}" style="display:block;width:56px;height:56px;border-radius:50%;border:0"></td>` +
      `<td style="vertical-align:middle">${heading}</td></tr></table>`
    : `<div style="margin:0 0 20px">${heading}</div>`;

  return `<!-- staffra merchant nudge -->
<div style="background:#f4f3fb;padding:32px 16px;font-family:${FONT}">
  <div style="max-width:520px;margin:0 auto">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
      <td style="vertical-align:middle;padding-right:8px"><img src="${escapeHtml(asset(data.baseUrl, "/email/logo.png"))}" width="28" height="28" alt="Staffra" style="display:block;width:28px;height:28px;border:0"></td>
      <td style="vertical-align:middle;font-size:16px;font-weight:700;color:#1b1b1f">Staffra</td>
    </tr></table>
    <div style="background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e6e3f5">
      ${headingRow}
      ${bodyHtml}
    </div>
    <p style="font-size:12px;line-height:1.5;color:#6b6b76;margin:16px 4px 0">${escapeHtml(footerText)}</p>
  </div>
</div>`;
}

function button(label: string, url: string): string {
  return `<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#3525cd;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:8px">${escapeHtml(label)}</a></p>`;
}

function linkBox(label: string, url: string): string {
  return (
    `<div style="background:#f1efff;border:1px solid #dcd7ff;border-radius:10px;padding:14px 16px;margin:0 0 16px">` +
    `<div style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#5b4fd6;margin:0 0 6px">${escapeHtml(label)}</div>` +
    `<a href="${escapeHtml(url)}" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#3525cd;word-break:break-all;text-decoration:none">${escapeHtml(url)}</a>` +
    `</div>`
  );
}

export function renderMerchantNudgeEmail(
  kind: NudgeKind,
  data: MerchantNudgeData,
  language: EmailLanguage = "pt",
): RenderedEmail {
  const c = COPY[language];
  const hi = c.hi(data.ownerName);

  if (kind === "not_live" && data.agentName && data.chatUrl) {
    const a = data.agentName;
    const body = c.liveBody(a, data.companyName, data.scheduling);
    return {
      subject: c.liveSubject(a),
      html: layout(
        data,
        c.liveHeadline(a),
        `<p style="${P}">${escapeHtml(hi)}</p>` +
          `<p style="${P}">${escapeHtml(body)}</p>` +
          linkBox(c.linkLabel(a), data.chatUrl) +
          `<p style="${P}">${escapeHtml(c.liveHow)}</p>` +
          button(c.liveCta, data.ctaUrl),
        c.footer,
      ),
      text: [hi, "", body, data.chatUrl, "", c.liveHow, "", `${c.liveCta}: ${data.ctaUrl}`, "", c.footer].join("\n"),
    };
  }

  const body = c.stalledBody(data.companyName);
  return {
    subject: c.stalledSubject(data.agentName),
    html: layout(
      data,
      c.stalledHeadline(data.agentName),
      `<p style="${P}">${escapeHtml(hi)}</p>` + `<p style="${P}">${escapeHtml(body)}</p>` + button(c.stalledCta, data.ctaUrl),
      c.footer,
    ),
    text: [hi, "", body, "", `${c.stalledCta}: ${data.ctaUrl}`, "", c.footer].join("\n"),
  };
}
