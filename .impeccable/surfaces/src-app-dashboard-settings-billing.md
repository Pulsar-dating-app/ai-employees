---
version: 1
slug: "src-app-dashboard-settings-billing"
primary_target: "src/app/dashboard/settings/billing"
related_targets: []
---

# Billing

Scope: `src/app/dashboard/settings/billing` — merchant-facing Operate surface inside the established dashboard world (tokens in `src/app/globals.css`), sibling of the Conversations inbox redesign.

Audience and job: an owner/admin either choosing a first plan (or reactivating after cancel), or checking an active plan's usage and switching tiers. Infrequent but high-stakes visits; the no-plan state is the moment a merchant decides to pay.

Constraints: prices, quotas and trial terms come only from `plans.ts` (placeholders, never invented); a checkout-link click is never a sale; no "AI/agent/bot" wording; plan changes for existing subscribers are confirmed on Stripe (checkout route opens the Portal plan-switch flow); read-only members see everything but no actions.

## Direction contract

THESIS: billing as staffing — no plan: "put your team to work", with the team's own faces, the trial explained once, and three tiers across the full width; with a plan: one panel that shows the plan and how much of this period's replies are used, then the tiers again with the current one marked for one-click switching. Refuses the old 8/4 grid with a duplicate "Billing summary" card and the trial note repeated in every card.

OWN-WORLD: same as the inbox — indigo on cool neutrals, 28px-radius shells with the soft indigo-tinted shadow, success tokens only for live/positive status, pastel-free; hired team members' photos are the only imagery.

STORY: no plan → sees the team waiting, the trial facts, picks period/WhatsApp, compares 3 tiers (Intermediate highlighted), starts a trial. With plan → reads status, usage ring and renewal at a glance, acts on warnings, switches tiers or manages payment on Stripe.

FIRST VIEWPORT: no plan: page header, hero shell (team faces, headline, body, trial fact strip), then the centered period/WhatsApp controls and the top of the three cards. With plan: warning banner if any, then the plan panel (name, status, price, renewal + period timeline, actions | usage ring).

FORM: surface extension in the established world; user picked "Contratação da equipe" (1 of 3) and "Painel + trocar plano" (1 of 2) via structured question; no seed roll.

Signature interaction / motion: the period switch indicator glides and prices re-settle (blur-in) when period/WhatsApp changes; the usage ring draws itself on load; cards rise in once. Reduced motion keeps opacity only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
