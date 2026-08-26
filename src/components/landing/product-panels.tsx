import { getTranslations } from "next-intl/server";
import { AgentMark } from "./agent-mark";
import { WhatsAppThread, type DemoMessage } from "./whatsapp-thread";
import type { PublicAgent } from "./agents";

// Authored product surfaces: real application UI rendered as live DOM at
// reduced scale, not screenshots. Crisp at any resolution, translatable,
// animatable, and impossible to leave stale when the app changes. They use
// Geist (the dashboard's own face) so they read as genuinely the product.
//
// If real screenshots are ever supplied, each panel body can be swapped for
// an <Image> inside the same PanelChrome without touching the stepper.

function PanelChrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--l-line)] bg-[var(--l-panel)] shadow-[0_1px_2px_rgba(22,24,29,0.04),0_24px_48px_-24px_rgba(22,24,29,0.22)]">
      <div className="flex items-center gap-2 border-b border-[var(--l-line-soft)] bg-[var(--l-sunken)] px-3.5 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-[7px] w-[7px] rounded-full bg-[#e2e4ea]" />
          <span className="h-[7px] w-[7px] rounded-full bg-[#e2e4ea]" />
          <span className="h-[7px] w-[7px] rounded-full bg-[#e2e4ea]" />
        </span>
        <span className="ml-1 text-[11px] font-medium tracking-[0.01em] text-[var(--l-faint)]">
          {title}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Row({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  return (
    <div className="l-row" style={{ animationDelay: `${160 + index * 90}ms` }}>
      {children}
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

/* ---------- 1 · Hire: the marketplace ---------- */
export async function MarketplacePanel({ agents }: { agents: PublicAgent[] }) {
  const t = await getTranslations("Landing.panels");
  const shown = agents.slice(0, 2);

  return (
    <PanelChrome title={t("marketplace.title")}>
      <div className="grid grid-cols-2 gap-3">
        {shown.map((agent, i) => (
          <Row key={agent.slug} index={i}>
            <div
              className={`rounded-xl border p-3.5 ${
                i === 0
                  ? "border-[var(--l-indigo)] bg-[var(--l-indigo-tint)]"
                  : "border-[var(--l-line)] bg-[var(--l-panel)]"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  i === 0
                    ? "bg-[var(--l-coral-tint)] text-[var(--l-coral)]"
                    : "bg-[var(--l-sunken)] text-[var(--l-faint)]"
                }`}
              >
                <AgentMark className="h-[18px] w-[18px]" />
              </span>
              <p className="mt-2.5 text-[13px] font-semibold text-[var(--l-ink)]">{agent.name}</p>
              <p className="text-[11px] text-[var(--l-sub)]">{agent.role}</p>
              {i === 0 ? (
                <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-[var(--l-indigo)] px-2 py-[3px] text-[10px] font-semibold text-white">
                  <Check className="h-2.5 w-2.5" />
                  {t("marketplace.hired")}
                </span>
              ) : (
                <span className="mt-2.5 inline-flex rounded-full border border-[var(--l-line)] px-2 py-[3px] text-[10px] font-medium text-[var(--l-sub)]">
                  {t("marketplace.available")}
                </span>
              )}
            </div>
          </Row>
        ))}
      </div>
    </PanelChrome>
  );
}

/* ---------- 2 · Teach: business knowledge ---------- */
export async function KnowledgePanel() {
  const t = await getTranslations("Landing.panels");
  const sections = t.raw("knowledge.sections") as string[];
  const filled = sections.length;

  return (
    <PanelChrome title={t("knowledge.title")}>
      <Row>
        <div className="mb-3.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11.5px] font-semibold text-[var(--l-ink)]">
              {t("knowledge.completeness", { filled, total: filled })}
            </span>
            <span className="text-[11px] text-[var(--l-green)]">100%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--l-sunken)]">
            <span
              className="l-progress block h-full rounded-full bg-[var(--l-green)]"
              style={{ animationDuration: "1.4s", animationDelay: "300ms" }}
            />
          </div>
        </div>
      </Row>
      <div className="flex flex-col gap-1.5">
        {sections.map((section, i) => (
          <Row key={section} index={i}>
            <div className="flex items-center justify-between rounded-lg border border-[var(--l-line-soft)] bg-[var(--l-sunken)] px-3 py-2">
              <span className="text-[12px] font-medium text-[var(--l-ink)]">{section}</span>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--l-green-tint)] text-[var(--l-green)]">
                <Check className="h-2.5 w-2.5" />
              </span>
            </div>
          </Row>
        ))}
      </div>
    </PanelChrome>
  );
}

/* ---------- 3 · Connect: channels ---------- */
export async function ChannelPanel() {
  const t = await getTranslations("Landing.panels");

  return (
    <PanelChrome title={t("channel.title")}>
      <Row>
        <div className="rounded-xl border border-[var(--l-line)] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#128c7e] text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 2a8 8 0 110 16 8 8 0 01-4.2-1.2l-.3-.2-2.5.6.7-2.4-.2-.3A8 8 0 0112 4z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--l-ink)]">WhatsApp Business</p>
              <p className="text-[11.5px] text-[var(--l-sub)]">+55 11 9 ••••-4823</p>
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-[var(--l-green-tint)] px-3 py-2">
            <span className="l-pulse h-1.5 w-1.5 rounded-full bg-[var(--l-green)]" />
            <span className="text-[11.5px] font-semibold text-[var(--l-green)]">
              {t("channel.connected")}
            </span>
          </div>
        </div>
      </Row>
      <Row index={1}>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--l-faint)]">
          {t("channel.note")}
        </p>
      </Row>
    </PanelChrome>
  );
}

/* ---------- 4 · Sell: the live conversation ---------- */
export async function ConversationPanel({ messages }: { messages: DemoMessage[] }) {
  const t = await getTranslations("Landing.panels");

  return (
    <PanelChrome title={t("conversation.title")}>
      <div className="overflow-hidden rounded-xl border border-[var(--l-line-soft)]">
        <div className="flex items-center gap-2.5 bg-[#128c7e] px-3 py-2.5 text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
            M
          </span>
          <div className="leading-tight">
            <div className="text-[12px] font-semibold">Malu</div>
            <div className="text-[10px] opacity-80">{t("conversation.online")}</div>
          </div>
        </div>
        <div className="bg-[#ece5dd]">
          <WhatsAppThread messages={messages} />
        </div>
      </div>
    </PanelChrome>
  );
}
