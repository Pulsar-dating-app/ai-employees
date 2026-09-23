---
version: 1
slug: "src-app-dashboard-metrics-page-tsx"
primary_target: "src/app/dashboard/metrics/page.tsx"
related_targets: ["src/app/dashboard/metrics/performance-view.tsx"]
---

# Performance

Scope: `src/app/dashboard/metrics` (page.tsx, performance-view.tsx, conversations-chart.tsx, funnel.tsx, loading.tsx, constants.ts): a merchant-facing Operate surface inside the established dashboard world. The locked-page and no-company branches are unchanged.

Audience and job: an owner checking whether their hired assistant is paying off. It answers three questions: how many conversations are coming in, compared with the period before; how far customers get toward a sale or an appointment; and whether the figures the assistant quotes are checked. It gets a weekly glance on desktop and sometimes a phone check.

Constraints: every number comes from the database, through `loadCompanyAnalytics` / `loadSchedulingAnalytics` (current and previous period, loaded as daily series) and `loadGroundingCounts`. The 90-day chart sums daily data into 7-day buckets anchored at today, so the latest point is never a partial week. A checkout click is not a sale, and the page says so. Copy must not say "AI", "agent" or "bot".

## Direction contract

THESIS: the page is a performance report. One hero conversations chart, with a 48px total, its change against the previous period, and a gray previous-period line. Beside it, a funnel shows how far customers got, with step rates. Under both, a compact reliability strip. It replaces the old grid of equal metric cards with sparklines and the separate health card.

OWN-WORLD: indigo #4f46e5 series on cool neutrals, 24px-radius hairline cards, and the hero card's soft indigo shadow. It reuses the sliding range indicator from the other redesigned screens. Success and error colors appear only on the change text, and all other text uses text tokens.

STORY: the merchant sees the total and whether it went up, hovers a day to compare it with the same day of the previous period, and reads where customers drop off. For Ana (scheduling) the funnel is Appointments → Completed, with cancelled, no-show and waitlist counts listed beside it. Conversations are left out of her funnel because appointments are counted for the whole company (scheduling.ts, `loadSchedulingAnalytics`), so tying them to conversations would overstate her.

FIRST VIEWPORT: at 1440×900, a filter row (agent select, range switch and status chip), then the chart card next to the funnel card, with the reliability strip starting at the fold. On a phone, everything stacks. There is no visible page header: the top bar names the page, and the h1 is sr-only.

FORM: an extension of the established world. The user answered the structured layout question, verbatim: "Funil + gráfico principal (Recomendado)". No concept roll ran.

Signature interaction / motion: the chart lines reveal left to right, and the funnel bars grow in sequence. The crosshair tooltip lists both periods. While the range or agent changes, the content dims and a progress sweep runs. Reduced motion shows the final state immediately.

FINISH: a build that is unreviewed and undocumented is unfinished. This one ends with the finish review, the verdict and the docs.
