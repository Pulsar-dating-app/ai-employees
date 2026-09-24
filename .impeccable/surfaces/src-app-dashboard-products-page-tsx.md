---
version: 1
slug: "src-app-dashboard-products-page-tsx"
primary_target: "src/app/dashboard/products/page.tsx"
related_targets: ["src/app/dashboard/products/products-manager.tsx"]
---

# Products

Scope: `src/app/dashboard/products`, covering page.tsx, products-manager.tsx, product-list.tsx, product-form.tsx, add-products-panel.tsx, import-panel.tsx, shopify-connect-card.tsx and loading.tsx. It is a merchant-facing Operate surface inside the established dashboard world. Shared pieces were promoted to `src/components/ui/`: `side-drawer.tsx` (formerly the Services drawer) and `filter-chips.tsx` (formerly the Services category chips). Services now uses both.

Audience and job: an owner or team member keeping the catalog Malu sells from up to date. They find a product, check its price and stock, fix a detail, deactivate what is gone, and bring products in by spreadsheet, Shopify or one at a time. They visit often on desktop and check quickly on a phone. The catalog can be very large, because a Shopify sync has no product ceiling.

Constraints:
- The existing API is unchanged. The list keeps server pagination (20 per page) and uses the `search` (ilike on name), `category` (exact match) and `includeInactive` params.
- Categories for the chips come from one server scan capped at 5000 rows.
- Deactivate is a soft delete with a confirmation, and it can be undone with Reactivate.
- Import runs as a background job with polling.
- Shopify OAuth returns to `?shopify=` / `?shopify_error=`. Connect, disconnect and full re-sync are admin-only, and any member can edit.
- Copy never says "AI", "agent" or "bot". The two leftover "your AI employee" strings in the form and import hints were fixed to "your team".

## Direction contract

THESIS: the catalog comes first. The list is the page:
- A toolbar with instant search (300ms debounce), sliding category chips, a "show deactivated" toggle and an "Add products" button.
- Rows with a photo thumbnail (a package icon when there's no image), name, SKU · category, stock status ("Sold out", "Only N left", "N in stock", "Stock not tracked") and a price formatted in the product's currency.
- "Add products" opens a side drawer with a segmented Spreadsheet / Shopify / One-by-one switch. Editing opens the same drawer.

This replaces the old big "Add products" card that sat above a raw table with two buttons per row.

OWN-WORLD: the same indigo world as Services. It uses 24px-radius hairline cards, the shared drawer and chips, and the primary button with its indigo glow. Stock dots use success, amber and error colors, always next to a text label.

STORY: the merchant searches or picks a category and sees at a glance what is sold out or running low. They click a name or the pencil to edit in the drawer, and deactivate with an inline confirmation. An empty catalog shows three large cards, one per way to add products. Coming back from Shopify OAuth, or reloading during an import, opens the drawer on the right tab.

FIRST VIEWPORT: at 1440×800, the toolbar, then about 8 product rows. On a phone, the search, the chip strip, the add button, then stacked rows. There is no visible page header, since the top bar names the page; the h1 is sr-only.

FORM: an extension of the established world. It is exempt from the concept roll because it extends the approved Services pattern: the same shared drawer, chips, row idiom and inline deactivate confirmation. The user picked the layout in the structured question, verbatim: "Catálogo primeiro (Recomendado)".

Signature interaction / motion:
- Rows cascade in whenever the filter or page changes.
- The chip indicator glides between categories.
- A progress sweep runs while the list refetches.
- The drawer slides in, and its method switch glides.
- The empty-state method cards lift on hover.
- The drop zone lights up while a file is dragged over it.

FINISH: a build that is unreviewed and undocumented is unfinished. This one ends with the finish review, the verdict and the docs.
