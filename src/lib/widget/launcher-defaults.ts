export type DefaultLauncherAsset = {
  src: string;
};

const AGENT_DEFAULT_LAUNCHERS: Partial<Record<string, readonly [DefaultLauncherAsset, DefaultLauncherAsset]>> = {
  malu: [{ src: "/agents/sales-1-launcher.webm" }, { src: "/agents/sales-2-launcher.webm" }],
  ana: [{ src: "/agents/ana-classic-launcher.webm" }, { src: "/agents/secretary-2-launcher.webm" }],
};

const LEGACY_SHARED_CLASSIC: DefaultLauncherAsset = { src: "/widget-launcher.webm" };

export function resolveDefaultLauncher(slug: string, photoType?: string | null): DefaultLauncherAsset {
  const defaults = AGENT_DEFAULT_LAUNCHERS[slug];
  if (!defaults) return LEGACY_SHARED_CLASSIC;
  return photoType === "default_2" ? defaults[1] : defaults[0];
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
  ana: "Agende seu horário aqui!",
};

const GENERIC_DEFAULT_GREETING = "Posso ajudar?";

export function resolveDefaultGreeting(slug: string): string {
  return AGENT_DEFAULT_GREETINGS[slug] ?? GENERIC_DEFAULT_GREETING;
}
