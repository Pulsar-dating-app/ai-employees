// Curated default embed-widget launcher video, per agent slug -- the
// circular bubble's own looping character video. A slug with no entry here
// falls back to the original shared /widget-launcher.webm (that file
// predates this per-agent system and is effectively Malu's own launcher
// already).

export type DefaultLauncherAsset = {
  src: string;
};

const AGENT_DEFAULT_LAUNCHERS: Partial<Record<string, DefaultLauncherAsset>> = {
  ana: { src: "/agents/ana-classic-launcher.webm" },
};

const LEGACY_SHARED_CLASSIC: DefaultLauncherAsset = { src: "/widget-launcher.webm" };

export function resolveDefaultLauncher(slug: string): DefaultLauncherAsset {
  return AGENT_DEFAULT_LAUNCHERS[slug] ?? LEGACY_SHARED_CLASSIC;
}

// Predefined teaser-bubble greeting, per agent slug -- shown until a
// merchant sets their own via the Customize card. Not run through next-intl:
// this is baked as a literal `data-greeting` value at snippet-generation
// time (a real Server Component call site, but the customer viewing the
// merchant's site is never the same person/locale as whoever generated the
// snippet), so there's no correct locale to resolve against here the way
// there is for the rest of this app's UI chrome. Written in Portuguese by
// deliberate choice for that reason -- see decisions.md. A merchant can
// still freely type their own greeting in any language via the Customize
// card's greeting field, same as always.
const AGENT_DEFAULT_GREETINGS: Partial<Record<string, string>> = {
  malu: "Oi! 👋 Posso ajudar a encontrar o que você procura?",
  ana: "Oi! 😊 Precisa marcar ou reagendar um horário? Posso te ajudar!",
};

const GENERIC_DEFAULT_GREETING = "Oi! 👋 Posso te ajudar?";

export function resolveDefaultGreeting(slug: string): string {
  return AGENT_DEFAULT_GREETINGS[slug] ?? GENERIC_DEFAULT_GREETING;
}
