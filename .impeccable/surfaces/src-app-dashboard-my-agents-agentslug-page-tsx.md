---
version: 1
slug: "src-app-dashboard-my-agents-agentslug-page-tsx"
primary_target: "src/app/dashboard/my-agents/[agentSlug]/page.tsx"
related_targets: ["src/app/dashboard/my-agents/[agentSlug]/channel-hub.tsx"]
---

# Hired employee page

Scope: `src/app/dashboard/my-agents/[agentSlug]` (Malu and Ana share it), covering page.tsx, agent-hero.tsx, availability-card.tsx (now `AvailabilityControl`), identity-editor.tsx (now the profile form inside a drawer), channel-hub.tsx, channel-status.tsx, human-handoff-card.tsx, and the status reporting added to channels-section.tsx, instagram-connect-card.tsx and embed-domains-section.tsx. It is a merchant-facing Operate surface inside the established dashboard world. `SideDrawer` gained `keepMounted` and `size="lg"`, and `FilterChips` gained `refreshKey`. `PolicySection` lost its `bare` mode.

Audience and job: an owner or admin looking after one hired employee. They check at a glance whether the employee is working and on which channels, connect or adjust a channel, rename the employee or change the photo, and, for Malu, keep the shipping and returns policies current. Visits are occasional on desktop, with some phone checks. The first-visit tour points at `data-tour="agent-name"`, `"human-handoff"` and `"channels"`.

Constraints:
- No API change.
- WhatsApp Embedded Signup (the FB SDK and its postMessage listener), the widget customize↔snippet `router.refresh` coupling and the Instagram OAuth return all need their panels to stay mounted. So the channel drawer is `keepMounted`: it's hidden when closed, not unmounted, which is the same lifetime the old tab panels had.
- Pause/resume, name and photo and connect/disconnect are admin-gated (`canEdit`).
- Human handoff is company-wide, and the copy says so.
- Shipping and returns are Malu-only.
- Copy never says "AI", "agent" or "bot". The role string ("Sales Representative") is platform data and stays as stored.

## Direction contract

THESIS: the page is about the employee. It opens with a hero: a large portrait, the name as h1, an "Edit profile" link that opens a drawer, the role, a live "Responding to customers" pill with Pause, and the description. Next comes "Where {name} talks to customers", a grid of five channel cards (WhatsApp, Instagram, Telegram, Embed, Link), each with its brand tile and a live status: Connected · detail, Not connected, Not in your plan, Payment issue with Meta, Ready to share, or No sites allowed yet / N sites allowed. Clicking a card opens that channel's configuration in a large side drawer, which has a chip switcher to move between channels. Last comes "How {name} works": always-open blocks for Shipping and Returns (Malu only) and Human handoff. This replaces the old "Connections — Malu" heading, the profile card and two tabbed cards that hid every channel's state.

OWN-WORLD: indigo on cool neutrals, 24–28px-radius hairline cards, and the hero's soft indigo shadow. Channel brand colors appear only in the icon tiles. Status dots use success, amber, outline and lock, always with a text label. It reuses the shared drawer, chips, SettingsBlock and the live dot.

STORY: the merchant lands on the page and sees Malu responding. WhatsApp is locked by the plan, Instagram isn't connected, and the embed has no allowed sites (amber). They click Embed, allow a domain in the drawer, and the card turns to "1 site allowed". Coming back from Instagram OAuth (`?instagram=`) auto-opens the drawer on Instagram.

FIRST VIEWPORT: at 1440×900, the back link, the hero and the full channel grid, with "How {name} works" starting at the fold. On a phone, the hero and channels stack.

FORM: an extension of the established world, exempt from the concept roll because it reuses the approved pattern language: the Products/Services drawer, the Settings SettingsBlock and the shared chips. The user picked the layout in the structured question, verbatim: "Perfil + painel de canais (Recomendado)".

Signature interaction / motion:
- The portrait and channel cards cascade in.
- Cards lift on hover.
- The live dot pulses on the status pill.
- The drawer slides in, and its chip indicator glides between channels.
- Status lines show a skeleton until each panel reports.

FINISH: a build that is unreviewed and undocumented is unfinished. This one ends with the finish review, the verdict and the docs.
