---
version: 1
slug: "src-app-dashboard-page-tsx"
primary_target: "src/app/dashboard/page.tsx"
related_targets: ["src/app/dashboard/team-badge.tsx"]
---

# My team

Scope: `src/app/dashboard/page.tsx` (+ `team-badge.tsx`) — the dashboard home, merchant-facing Operate surface inside the established dashboard world; sibling of the Conversations inbox and Billing redesigns.

Audience and job: a merchant landing in the dashboard, checking who works for them, whether each one is answering, and whether anything is waiting on them; occasionally hiring the next team member. Catalog is tiny today (Malu, Ana).

Constraints: every number is real (conversations with activity in the last 7 days per team member; conversations paused or awaiting confirmation, not closed) — no invented stats (a mocked "conversations today" stat was removed before on purpose); no "AI/agent/bot" wording; `agent-card.tsx` stays because the landing demo imports it.

## Direction contract

THESIS: staff badges — hired members are large portrait badges with live status and their real week of work plus what's waiting on the merchant; hiring is a separate, quieter "Available to hire" row. Refuses the old half-width list that rendered hired and unhired identically behind tabs and a search box built for a two-person catalog.

OWN-WORLD: same as inbox/billing — indigo on cool neutrals, 28px-radius shells with the soft indigo-tinted shadow, success tokens only for live status, the team members' portraits as the only imagery, shared StatusBanner for billing warnings.

STORY: merchant sees their team at a glance (who's answering, who's paused), sees "N conversations need you" and jumps to the inbox, or opens a member to manage them; below, meets whoever else can be hired.

FIRST VIEWPORT: billing banner if any, "Your team" heading, then horizontal badges two per row at lg (portrait left with status pill, name, role, two activity lines, Manage button; ~240px tall), and the "Available to hire" rows — which must stay above the fold at 1440×800 (MacBook Air) even with a banner and two hired members, so the merchant sees there is more to hire without scrolling. No visible page header (the top bar already names the page; sr-only h1).

FORM: surface extension in the established world; user picked "Crachás da equipe" (1 of 2) via structured question; no seed roll.

Signature interaction / motion: badges rise in with a short stagger, conversation counts count up once, the live dot pulses on answering members, portraits ease-zoom on hover. Reduced motion keeps opacity only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
