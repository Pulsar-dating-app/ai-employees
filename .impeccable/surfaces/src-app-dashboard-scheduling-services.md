---
version: 1
slug: "src-app-dashboard-scheduling-services"
primary_target: "src/app/dashboard/scheduling/services"
related_targets: []
---

# Services (Scheduling)

Scope: `src/app/dashboard/scheduling/services` (page.tsx, services-manager.tsx, service-list.tsx, service-drawer.tsx, service-form.tsx, default-service-card.tsx) — merchant-facing Operate surface inside the established dashboard world; sibling of the Appointments agenda.

Audience and job: a service business owner keeping the menu of bookable services right (name, duration, buffer, price, category), adding new ones, retiring old ones, and deciding whether the catch-all default service is on. Occasional visits, mostly desktop, sometimes phone.

Constraints: every service shown comes from `services` rows (active + deactivated, non-default); create/edit/deactivate/reactivate use the existing routes; prices come only from the row (null = "Price varies"); no "AI/agent/bot" wording (the old default-service hint said "AI employee" and was fixed).

## Direction contract

THESIS: a service menu — services grouped by category like a salon's price list (name + short description | duration with after-buffer | price | edit/deactivate), instant search and category chips on top, add/edit in a side drawer, deactivated services folded away, the default service as a compact row at the end. Refuses the old stack of a large default-service form on top, an empty "Add service" card that was only a button, and a spreadsheet table with a search button and pagination.

OWN-WORLD: indigo on cool neutrals, 24px-radius group shells with hairline borders, sliding-indicator chips shared with the Appointments screen, currency-formatted prices in tabular numerals, primary indigo reserved for "Add service" and Save.

STORY: merchant scans the menu by category, finds a service by typing, edits it in the drawer without losing their place, deactivates with an inline confirmation, reactivates from the folded section, toggles the default service.

FIRST VIEWPORT: toolbar (search pill, category chips, Add service at right), then the first category group. No visible page header (tabs + top bar name the page; sr-only h1). With zero services: warn banner + an empty menu teaching to add the first one.

FORM: surface extension in the established world; user picked "Cardápio de serviços" (1 of 3) via structured question; no seed roll.

Signature interaction / motion: rows rise in with a short stagger, chip indicator glides, drawer slides in from the right over a scrim, inline confirmation and default-service fields blur in. Reduced motion keeps opacity only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
