export const SETTINGS_TOTAL_SECTIONS = 4;
// Below this many filled sections the sidebar's Settings tab shows its
// warning icon and the Settings page shows its "almost empty" alert -- one
// constant so the two can't disagree.
export const SETTINGS_MIN_SECTIONS = 2;

export type SettingsCompletenessFields = {
  description: string | null;
  payment_policy: string | null;
  additional_information: string | null;
  faq: unknown[] | null;
};

// Shared by settings/page.tsx (the completeness meter shown on the page
// itself) and dashboard/layout.tsx (rolls the same count up into the
// sidebar's Settings nav item warning) -- one definition of "a filled
// section" so the two can never drift apart. Shipping/return policy
// deliberately excluded -- those moved to each hired agent's own
// Connections page (see settings/page.tsx's own top comment) and aren't
// part of this company-wide metric.
export function countFilledSections(company: SettingsCompletenessFields): number {
  return [
    Boolean(company.description),
    Boolean(company.payment_policy),
    Array.isArray(company.faq) && company.faq.length > 0,
    Boolean(company.additional_information),
  ].filter(Boolean).length;
}
