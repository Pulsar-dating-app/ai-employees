---
version: 1
slug: "src-app-dashboard-scheduling-settings-page-tsx"
primary_target: "src/app/dashboard/scheduling/settings/page.tsx"
related_targets: ["src/app/dashboard/scheduling/settings/settings-shell.tsx"]
---

# Scheduling settings

Scope: `src/app/dashboard/scheduling/settings`, covering page.tsx, settings-shell.tsx and the five section cards (business-hours, appointment-controls, time-off, intake-questions, google-calendar) plus loading.tsx. It is a merchant-facing Operate surface inside the established dashboard world, under the Scheduling sub-tabs. Shared pieces were promoted to `src/components/ui/`: `settings-block.tsx` and `use-scroll-spy.ts`. General settings now uses them too.

Audience and job: an owner or admin who sets up how the business takes appointments. They set weekly hours (split shifts allowed), the approval and booking limits, one-off closures, what to ask the customer before booking, and the Google Calendar connection. Setup happens occasionally on desktop, with quick fixes on a phone. The Appointments page deep-links to `#business-hours` and `#google-calendar`.

Constraints:
- No API or schema change. The hours save the whole week in one explicit PUT with client-side validation.
- Approval and the limits autosave through the company PATCH.
- Time off uses its own POST and DELETE routes.
- Intake questions keep an explicit save.
- Calendar connect and disconnect are admin-only.
- Copy never says "AI", "agent" or "bot".

## Direction contract

THESIS: the same guided-document pattern as general Settings. A sticky index on the left lists the five sections, each with a live one-line summary of its saved state (for example "Open 6 days a week", "Not connected") and a warning where something blocks bookings. The blocks on the right are always open. This replaces the old stack of collapsed accordions, where only the calendar row showed state and opening everything made the page long.

OWN-WORLD: indigo on cool neutrals, with 24px-radius hairline blocks and the vertical sliding indicator used by the other redesigned screens. The warning orange matches the sidebar and tab warnings, and success tokens are used only for "connected" and "saved". Each day's hours show as a thin timeline on a 00–24h ruler.

STORY: the merchant sees at a glance what's set and what's missing, and jumps there from the index. They change hours and watch the day's timeline move, then save, and the index summary updates. Setting a closure shows it as a dated row. Connecting the calendar clears the warning in the index, the tab and the sidebar.

FIRST VIEWPORT: at 1440×800, the Scheduling tabs, then the index beside the Business hours block. On a phone, a sticky strip of section chips sits above the stacked blocks. There is no visible page header, since the tabs name the page; the h1 is sr-only.

FORM: an extension of the established world. The user answered the structured layout question, verbatim: "Navegação lateral (Recomendado)". No concept roll ran.

Signature interaction / motion:
- The index highlight glides as you scroll or click.
- Hour timelines animate their bars as the times change.
- New closures and extra questions fade in.
- A deep link locks the index on its section.
- Reduced motion is covered by the existing global rules.

FINISH: a build that is unreviewed and undocumented is unfinished. This one ends with the finish review, the verdict and the docs.
