---
version: 1
slug: "src-app-dashboard-conversations"
primary_target: "src/app/dashboard/conversations"
related_targets: []
---

# Conversations inbox

Scope: `src/app/dashboard/conversations` — merchant-facing Operate surface inside the established dashboard world (Stitch "Human-Centric AI" tokens in `src/app/globals.css`).

Audience and job: a merchant checking which customers need a human, reading what their hired team member (Malu, Ana…) told customers, stepping in with a reply, and handing the conversation back. Frequent, short visits; desktop first, phone second.

Constraints: no "AI/agent/bot" wording in either locale; buying signals are never sales; search only matches name/phone (disclosed in the field hint).

## Direction contract

THESIS: a triage inbox — the list answers "who needs me right now?" by grouping (Needs you → Ready to buy → Everything else), and the conversation opens beside it, never on a separate page. Refuses the old data table + separate detail route.

OWN-WORLD: the dashboard's indigo-on-cool-neutral system; one large 28px-radius shell with a soft indigo-tinted shadow; list panel on surface-container-low, thread on surface; white customer bubbles, primary-fixed bubbles for the hired team member, solid primary bubbles for the merchant; deterministic pastel monogram avatars with channel badges; green only for live/buying signals.

STORY: merchant lands, sees counts per group and the "Open the first one" action; opens a thread; sees who is replying (live pill); replies (which pauses the team member, stated under the composer); hands back.

FIRST VIEWPORT: page header, then the split shell filling the viewport: 380px list (search, segmented status tabs, awaiting-confirmation chip, grouped rows) | overview panel with team faces, "N conversations need you", ready-to-buy pill, primary action, keyboard hint.

FORM: surface extension in the established world, user-chosen "Triage inbox" layout (option 1 of 3 presented); no seed roll — surface-scope choice made via structured question.

Signature interaction / motion: the selection highlight glides between rows (and tabs); the opened thread settles in with a blur-to-focus and its latest bubbles cascade up from the composer; phone opens the thread as a full-screen sheet from the right; reduced-motion keeps opacity only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
