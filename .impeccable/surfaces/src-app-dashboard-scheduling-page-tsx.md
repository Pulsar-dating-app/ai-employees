---
version: 1
slug: "src-app-dashboard-scheduling-page-tsx"
primary_target: "src/app/dashboard/scheduling/page.tsx"
related_targets: ["src/app/dashboard/scheduling/appointments-manager.tsx"]
---

# Appointments (Scheduling)

Scope: `src/app/dashboard/scheduling` index route (page.tsx, appointments-manager.tsx, today-panel.tsx, pending-approvals.tsx, agenda-row.tsx, agenda-format.ts, appointment-calendar.tsx) — merchant-facing Operate surface inside the established dashboard world; sibling of the inbox, billing and My Team redesigns. Services and Settings sub-tabs are out of scope.

Audience and job: a service business owner (salon, clinic) checking today's bookings that Ana took, approving requests, marking appointments done / no-show / cancelled, and scanning the coming days. Daily, often on a phone between clients.

Constraints: all times in the business's timezone, never the viewer's; every number and label comes from `appointments` rows; approve/decline/complete/no-show/cancel go through the existing PATCH route; no "AI/agent/bot" wording.

## Direction contract

THESIS: a day agenda — the screen opens on *today* (next appointment with a live countdown, the day's timeline across business hours with a now marker), then requests waiting on the merchant, then the agenda grouped by day. Refuses the old stack of heavy per-booking cards with a repeated date tile and a stat-tile side rail.

OWN-WORLD: indigo on cool neutrals, 28px/24px-radius shells with the soft indigo-tinted shadow, status colour vocabulary shared by rows, timeline and calendar (confirmed indigo, requested amber, completed green, no-show red, cancelled grey struck), Ana's portrait as the only imagery, shared StatusBanner for configuration warnings.

STORY: merchant sees what's next and how the day fills, approves or declines waiting requests in place, then works the agenda row by row (expand for Ana's summary and the customer's answers); switches to a month calendar to scan further out.

FIRST VIEWPORT: config banners if any, Today panel (heading + date + counts, Ana status chip, Next block with time/customer/service/countdown, timeline 09h–19h), then the amber "Waiting for your approval" block. No visible page header (tabs + top bar name the page; sr-only h1).

FORM: surface extension in the established world; user picked "Agenda do dia" (1 of 3) via structured question; no seed roll.

Signature interaction / motion: timeline blocks grow in from the left; day groups rise in with a short stagger; list/calendar and upcoming/past switches use the sliding indicator; the countdown and now marker tick every minute; expanded rows blur in. Reduced motion keeps opacity only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
