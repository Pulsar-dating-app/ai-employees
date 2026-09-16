// Starter service lists, by trade. Products cannot be guessed -- every shop
// sells something different -- but services can: a salon does cuts, colour and
// nails, and a barber does cuts and beards. So the first session hands the
// merchant a list to correct rather than a blank form to author, which is the
// same "review, don't write" move the catalogue import makes for a sales hire,
// at none of the risk: this is curated content, not inference.
//
// Structure lives here; every label is authored copy in
// messages/*.json under `Onboarding.setup.services.presets`, so it localises
// and is improved without a migration. `other` is deliberately last and
// deliberately empty -- no trade list may become a wall the merchant has to
// argue with.
export type ServicePreset = { key: string; durationMinutes: number };

export const SERVICE_PRESET_TRADES = [
  "salon",
  "barber",
  "aesthetics",
  "clinic",
  "studio",
  "other",
] as const;

export type ServicePresetTrade = (typeof SERVICE_PRESET_TRADES)[number];

export const SERVICE_PRESETS: Record<ServicePresetTrade, readonly ServicePreset[]> = {
  salon: [
    { key: "cut", durationMinutes: 60 },
    { key: "blowout", durationMinutes: 45 },
    { key: "colour", durationMinutes: 120 },
    { key: "manicure", durationMinutes: 40 },
    { key: "brows", durationMinutes: 20 },
  ],
  barber: [
    { key: "cut", durationMinutes: 40 },
    { key: "beard", durationMinutes: 30 },
    { key: "cutBeard", durationMinutes: 60 },
    { key: "lineup", durationMinutes: 15 },
  ],
  aesthetics: [
    { key: "facial", durationMinutes: 60 },
    { key: "massage", durationMinutes: 60 },
    { key: "waxing", durationMinutes: 45 },
    { key: "drainage", durationMinutes: 60 },
  ],
  clinic: [
    { key: "consultation", durationMinutes: 45 },
    { key: "followUp", durationMinutes: 30 },
    { key: "assessment", durationMinutes: 60 },
  ],
  studio: [
    { key: "quote", durationMinutes: 30 },
    { key: "smallSession", durationMinutes: 120 },
    { key: "largeSession", durationMinutes: 240 },
  ],
  other: [],
};

// Monday to Friday, 9 to 18 -- the shape of the overwhelming majority of the
// businesses this flow serves, offered as a starting point they adjust in two
// taps rather than a seven-row grid they fill in on day one.
export const DEFAULT_OPEN_DAYS = [1, 2, 3, 4, 5] as const;
export const DEFAULT_OPEN_FROM = "09:00";
export const DEFAULT_OPEN_TO = "18:00";
