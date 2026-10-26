// The funnel events the app records (table `funnel_events`, migration
// 20261026120000). Allowlisted here because the client sends them through a
// server action, and anything it sends is untrusted: an unknown name is
// dropped, and properties are cut down to a few short scalar values.
//
// Pure, so it can be tested without a database.
export const FUNNEL_EVENTS = [
  // A first-session step came on screen. { step }
  "onboarding_step_viewed",
  // The merchant left the first session. { to: "dashboard" | a channel }
  "onboarding_finished",
  // A plan was confirmed on the plan step. { plan }
  "plan_chosen",
  // The hosted link was handed out. { surface: "onboarding" | "home" | "agent" }
  "link_shared",
  "link_copied",
  // A channel's setup panel was opened on the hire's page. { channel }
  "channel_panel_opened",
  // The Settings quick questions were saved. { fields }
  "quick_teach_saved",
  // The dashboard was opened, at most once a day per browser. A cookie
  // session never signs in again, so auth's last_sign_in_at can't tell a
  // merchant who returns from one who never does.
  "app_opened",
  // A link in one of the merchant nudge e-mails was followed. { kind }
  "nudge_clicked",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export type FunnelProperties = Record<string, string | number | boolean>;

const MAX_KEYS = 6;
const MAX_STRING = 80;
const KEY_PATTERN = /^[a-z][a-z_]{0,31}$/;

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return typeof value === "string" && (FUNNEL_EVENTS as readonly string[]).includes(value);
}

export function sanitizeFunnelProperties(input: unknown): FunnelProperties {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: FunnelProperties = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (!KEY_PATTERN.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}
