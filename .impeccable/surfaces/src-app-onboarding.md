---
version: 1
slug: "src-app-onboarding"
primary_target: "src/app/onboarding"
related_targets: []
---

## Scope

Onboarding V1: the merchant's first session, from a just-created account to their
hired employee working. Four steps — name the business, choose the employee,
give her what she needs to work, watch her do the job. Mode: **Operate** (the
merchant is completing a task), with one Persuade beat at the end.

Out of scope for V1: any extraction (site, Instagram, CNPJ), the teaching
conversation, and the agent recommendation. Those are V2–V5 in the approved
plan.

## Direction contract

THESIS: This is a new hire's first shift, not a setup wizard. It refuses the
category default — a progress bar over a stack of empty forms, where the product
is fully configured before it is ever seen working. Every step here ends with the
employee measurably more capable than she was, and the last step is her doing the
job on the merchant's own data. The checklist never turns green; she just starts
working.

OWN-WORLD: The incumbent Staffra Stitch system — indigo `#3525cd` primary on the
Material surface scale, Inter. This route's own incumbent identity is kept over
the dashboard's: the indigo→white diagonal gradient ground and the frosted white
`rounded-lg` card from the shipped "Setup Business" screen, not the dashboard's
`rounded-xl` / `shadow-level1` card. Every hairline is the `primary-fixed` role
token, never a raw hex. The onboarding's signature is restraint against the
dashboard's density: one centred column, one indigo action per screen, and the
employee's portrait as the only content image (the Staffra mark above the rail
is chrome). Recognizable with all content removed by one frosted column on the
indigo gradient with a single filled indigo control.

STORY: The merchant understands that the person they hired needs the same two
things any hire needs — to know what the business sells (or what it offers and
when it is open), and to be watched doing the job once. They believe she is ready
because they saw her answer with their own catalogue, not because a progress
meter filled up.

FIRST VIEWPORT: Centred single column, max 640px, on the indigo→white gradient.
The step rail sits above the card as four short hairline segments, the reached
ones filled indigo — no numerals, no percentage, and no step name above the
heading. The card holds one question at `headline-lg` and the controls beneath
it. The primary action sits bottom right of the card wherever the step has one
action; where the action is contextual to a chosen option (the catalogue step's
Connect / Choose file), it lives in that option's own panel and the step carries
no action row. The employee's portrait appears at 56px beside the question from
step 3 onward — step 2 has none, because nobody is hired yet.

FORM: Extension of an established surface, built directly rather than through a
concept round — the structure was decided with the user across the approved plan
artifact (five-door roadmap, V1 symmetric fork), so a tournament would
re-litigate their own decision. No seed key; new-work §3 "precisely specified
narrow request".

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Memorable moment

Step 4. She asks the merchant to talk to her as if they were a customer, and
answers with a real product and a real price out of the catalogue they imported
ninety seconds earlier. For Ana it is stronger still: she computes real
appointment slots against the services and hours just configured.

## Unresolved

- Whether the proof chat reuses the production agent engine (likely yes — in that
  moment the merchant genuinely is in the customer role, which is what the
  prompt already assumes).
- Number of industry presets for Ana's service list; "outro" must always exist
  and fall through to an empty list.
- **Open, blocking:** hiring requires an active plan (402 `plan_required`), and
  the 15-day trial only starts through Stripe Checkout. A brand-new merchant
  therefore dead-ends at step 2. The flow needs either a plan step or a routed
  recovery from the 402; undecided with the user.
