import { createServer, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for Shopify's per-shop Admin API + OAuth endpoints. Same
// reasoning as instagram-api-mock.ts: the route/lib under test runs in a
// separately-spawned `next dev` process, so an in-process fetch spy can't
// intercept it. src/lib/shopify/admin-api.ts is pointed here via
// SHOPIFY_ADMIN_API_BASE_URL, so only the path matters -- the shop host is
// gone. Which "store" a GraphQL call sees is keyed off the
// X-Shopify-Access-Token header instead.
//
// OAuth token exchange (POST /admin/oauth/access_token): code exchange
// (expiring=1) and the refresh grant. Magic values:
//   - code "trigger-token-failure"        -> 400
//   - refresh_token containing "expired"  -> 401 (terminal)
//
// GraphQL (POST /admin/api/<ver>/graphql.json), dispatched on the query:
//   - `shop { ... currencyCode }`   -> Mock Store / BRL
//   - `webhookSubscriptionCreate`   -> ok
//   - token contains "graphql-failure" -> every call 500s
//   - `bulkOperationRunQuery`       -> mints a bulk op; status is COMPLETED
//     unless the token contains "bulk-slow" (then RUNNING until /__bulk-complete)
//   - `currentBulkOperation` / `node(id:)` for a BulkOperation -> its state;
//     a COMPLETED op's `url` points at this mock's /bulk-jsonl/<token>
//   - `bulkOperationCancel`         -> ok
//   - `products(... query: $q ...)` (delta) -> registered products whose
//     `updatedAt` is after the `updated_at:>` cutoff in $q (a product with
//     no `updatedAt` is treated as very old, i.e. excluded from a delta)
//
// Catalogue + bulk control:
//   POST   /__products  { token, products: MockProductInput[] }
//   DELETE /__products
//   POST   /__bulk-complete { token }   -> flip a "bulk-slow" op to COMPLETED
//   GET    /bulk-jsonl/<encoded token>  -> the JSONL a completed bulk op serves

export type MockProductInput = {
  id: string | number;
  title: string;
  price?: string | number | null;
  sku?: string | null;
  status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
  productType?: string | null;
  descriptionHtml?: string | null;
  handle?: string;
  imageUrl?: string | null;
  updatedAt?: string; // ISO; only consulted by the delta (`products(query:)`) path
};

const VERY_OLD = "2000-01-01T00:00:00Z";

function handleOf(p: MockProductInput) {
  return p.handle ?? `product-${p.id}`;
}

function toGraphqlNode(p: MockProductInput) {
  return {
    id: `gid://shopify/Product/${p.id}`,
    handle: handleOf(p),
    title: p.title,
    descriptionHtml: p.descriptionHtml ?? null,
    productType: p.productType ?? null,
    status: p.status ?? "ACTIVE",
    onlineStoreUrl: null,
    featuredImage: p.imageUrl ? { url: p.imageUrl } : null,
    variants: { nodes: [{ price: p.price == null ? null : String(p.price), sku: p.sku ?? null }] },
  };
}

// One product line + one variant line per product, parent before child --
// the shape src/lib/shopify/admin-api.ts's downloadBulkProducts parses.
function toJsonl(products: MockProductInput[]): string {
  const lines: string[] = [];
  for (const p of products) {
    const pid = `gid://shopify/Product/${p.id}`;
    lines.push(
      JSON.stringify({
        id: pid,
        handle: handleOf(p),
        title: p.title,
        descriptionHtml: p.descriptionHtml ?? null,
        productType: p.productType ?? null,
        status: p.status ?? "ACTIVE",
        onlineStoreUrl: null,
        featuredImage: p.imageUrl ? { url: p.imageUrl } : null,
      }),
    );
    lines.push(
      JSON.stringify({
        id: `gid://shopify/ProductVariant/${p.id}-0`,
        price: p.price == null ? null : String(p.price),
        sku: p.sku ?? null,
        __parentId: pid,
      }),
    );
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export function startShopifyApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  const catalogues = new Map<string, MockProductInput[]>();
  // bulk op gid -> its state; and token -> current op gid
  const bulkOps = new Map<string, { token: string; status: string }>();
  const bulkOpByToken = new Map<string, string>();
  let opCounter = 0;
  let selfUrl = "";

  const bulkUrlFor = (token: string) => `${selfUrl}/bulk-jsonl/${encodeURIComponent(token)}`;

  function bulkState(gid: string) {
    const op = bulkOps.get(gid);
    if (!op) return null;
    const completed = op.status === "COMPLETED";
    const products = catalogues.get(op.token) ?? [];
    return {
      id: gid,
      status: op.status,
      url: completed && products.length > 0 ? bulkUrlFor(op.token) : null,
      objectCount: completed ? products.length * 2 : 0,
    };
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/__products" && req.method === "POST") {
      return readJsonBody(req, (body: { token: string; products: MockProductInput[] }) => {
        catalogues.set(body.token, body.products ?? []);
        send(200, { ok: true });
      });
    }
    if (url.pathname === "/__products" && req.method === "DELETE") {
      catalogues.clear();
      bulkOps.clear();
      bulkOpByToken.clear();
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === "/__bulk-complete" && req.method === "POST") {
      return readJsonBody(req, (body: { token: string }) => {
        const gid = bulkOpByToken.get(body.token);
        if (gid && bulkOps.has(gid)) bulkOps.get(gid)!.status = "COMPLETED";
        send(200, { ok: true });
      });
    }

    const jsonlMatch = url.pathname.match(/^\/bulk-jsonl\/(.+)$/);
    if (jsonlMatch && req.method === "GET") {
      const token = decodeURIComponent(jsonlMatch[1]);
      res.writeHead(200, { "content-type": "application/jsonl" });
      return res.end(toJsonl(catalogues.get(token) ?? []));
    }

    if (url.pathname === "/admin/oauth/access_token" && req.method === "POST") {
      return readJsonBody(
        req,
        (body: { code?: string; grant_type?: string; refresh_token?: string }) => {
          if (body.grant_type === "refresh_token") {
            const rt = body.refresh_token ?? "";
            if (rt.includes("expired")) return send(401, { errors: "mock: refresh token terminal" });
            return send(200, {
              access_token: `shopify-token-refreshed-${rt}`,
              refresh_token: `shopify-refresh-rotated-${rt}`,
              scope: "read_products",
              expires_in: 3600,
              refresh_token_expires_in: 7776000,
            });
          }
          const code = body.code ?? "";
          if (code === "trigger-token-failure") {
            return send(400, { errors: "mock: invalid authorization code" });
          }
          send(200, {
            access_token: `shopify-token-${code}`,
            refresh_token: `shopify-refresh-${code}`,
            scope: "read_products",
            expires_in: 3600,
            refresh_token_expires_in: 7776000,
          });
        },
      );
    }

    if (/^\/admin\/api\/[^/]+\/graphql\.json$/.test(url.pathname) && req.method === "POST") {
      const token = String(req.headers["x-shopify-access-token"] ?? "");
      return readJsonBody(req, (body: { query?: string; variables?: Record<string, unknown> }) => {
        const query = body.query ?? "";
        const vars = body.variables ?? {};

        if (token.includes("graphql-failure")) {
          return send(500, { errors: [{ message: "mock: graphql failure" }] });
        }
        if (query.includes("webhookSubscriptionCreate")) {
          return send(200, { data: { webhookSubscriptionCreate: { userErrors: [] } } });
        }
        if (query.includes("currencyCode")) {
          return send(200, { data: { shop: { name: "Mock Store", currencyCode: "BRL" } } });
        }

        if (query.includes("bulkOperationRunQuery")) {
          const gid = `gid://shopify/BulkOperation/${++opCounter}`;
          bulkOps.set(gid, { token, status: token.includes("bulk-slow") ? "RUNNING" : "COMPLETED" });
          bulkOpByToken.set(token, gid);
          return send(200, {
            data: {
              bulkOperationRunQuery: {
                bulkOperation: { id: gid, status: bulkOps.get(gid)!.status },
                userErrors: [],
              },
            },
          });
        }
        if (query.includes("currentBulkOperation")) {
          const gid = bulkOpByToken.get(token);
          return send(200, { data: { currentBulkOperation: gid ? bulkState(gid) : null } });
        }
        if (query.includes("bulkOperationCancel")) {
          const gid = String(vars.id ?? "");
          if (bulkOps.has(gid)) bulkOps.get(gid)!.status = "CANCELED";
          return send(200, { data: { bulkOperationCancel: { userErrors: [] } } });
        }
        if (query.includes("BulkOperation") && query.includes("node(")) {
          return send(200, { data: { node: bulkState(String(vars.id ?? "")) } });
        }

        if (query.includes("products(")) {
          let list = catalogues.get(token) ?? [];
          const q = typeof vars.q === "string" ? vars.q : "";
          const cutoff = q.startsWith("updated_at:>") ? q.slice("updated_at:>".length) : null;
          if (cutoff) {
            list = list.filter((p) => Date.parse(p.updatedAt ?? VERY_OLD) > Date.parse(cutoff));
          }
          return send(200, {
            data: {
              products: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: list.map(toGraphqlNode),
              },
            },
          });
        }
        return send(200, { data: {} });
      });
    }

    send(404, { errors: "mock: unknown endpoint" });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      selfUrl = `http://127.0.0.1:${port}`;
      resolve({ url: selfUrl, stop: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

function readJsonBody<T = unknown>(req: IncomingMessage, onEnd: (body: T) => void) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => onEnd(raw ? (JSON.parse(raw) as T) : ({} as T)));
}
