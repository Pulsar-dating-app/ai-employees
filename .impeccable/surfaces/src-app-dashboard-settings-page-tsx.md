---
version: 1
slug: "src-app-dashboard-settings-page-tsx"
primary_target: "src/app/dashboard/settings/page.tsx"
related_targets: ["src/app/dashboard/settings/settings-shell.tsx"]
---

# Business settings

Scope: `src/app/dashboard/settings` index (page.tsx, settings-shell.tsx, settings-block.tsx, business-info-section.tsx, policy-section.tsx, faq-section.tsx, company-autosave.tsx) — merchant-facing Operate surface inside the established dashboard world; the billing sub-route is out of scope (already redesigned).

Audience and job: an owner/admin teaching the team about the business (description, contact, payments, FAQ, anything else) and seeing what's still missing. Occasional, long-ish edit sessions on desktop; quick fixes on phone.

Constraints: completeness is the existing 4-section rule (`countFilledSections`: description, payment policy, FAQ, other information; contact is not counted); fields autosave on blur via PATCH /api/companies/[id]; FAQ keeps an explicit save; `PolicySection` keeps its `bare` mode used by the agent page; no "AI/agent/bot" wording.

## Direction contract

THESIS: settings as a guided document — a sticky section index on the left with live ✓ per counted section and an "N of 4 filled in" bar, scroll-tracked; the content on the right as calm blocks with paired fields. Refuses the old single long column of heavy cards under a page header, a separate completeness box and a large billing link card.

OWN-WORLD: indigo on cool neutrals, 24px-radius hairline blocks, sliding indicator shared with the other redesigned screens (vertical here), success tokens only for ✓, StatusBanner for past-due and low-completeness warnings, autosave status line in each block's header.

STORY: merchant sees at a glance which parts are missing, jumps there from the index, fills a field, sees "Changes saved" and the ✓ appear without a reload; FAQ questions expand to edit; plan & billing is one link away.

FIRST VIEWPORT: banners if any, then index (progress bar + 5 sections + Plan & billing link) beside the "About the business" block. Phone: progress line + horizontally scrolling section chips above the blocks. No visible page header (top bar names the page; sr-only h1).

FORM: surface extension in the established world; user picked "Navegação lateral" (1 of 3) via structured question; no seed roll.

Signature interaction / motion: the index highlight glides as you scroll or click, the progress bar grows as sections are completed, the ✓ appears live, FAQ items blur-expand. Reduced motion keeps opacity only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
