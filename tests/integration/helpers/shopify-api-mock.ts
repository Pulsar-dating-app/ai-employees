import { createServer, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for Shopify's per-shop Admin API + OAuth endpoints. Same
// reasoning as instagram-api-mock.ts: the route/lib under test runs in a
// separately-spawned `next dev` process, so an in-process fetch spy can't
// intercept it. src/lib/shopify/admin-api.ts is pointed here via
// SHOPIFY_ADMIN_API_BASE_URL, so only the path matters -- the shop host is
// gone. Which "store" a GraphQL call sees is therefore keyed off the
// X-Shopify-Access-Token header instead.
//
// OAuth token exchange (POST /admin/oauth/access_token):
//   - code === "trigger-token-failure" -> 400
//   - otherwise -> { access_token: "shopify-token-<code>", scope: "read_products" }
//
// GraphQL (POST /admin/api/<ver>/graphql.json), dispatched on the query text:
//   - `shop { name currencyCode }` -> Mock Store / BRL
//   - `webhookSubscriptionCreate`  -> ok (no userErrors)
//   - `products(` -> the catalogue registered for this request's access
//     token via POST /__products, or an empty list if none was registered
//   - access token contains "graphql-failure" -> every GraphQL call 500s
//
// Catalogue control (so a test can re-sync a changed store):
//   POST   /__products  { token, products: MockProductInput[] }  -> set
//   DELETE /__products                                            -> clear all

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
};

function toGraphqlNode(p: MockProductInput) {
  return {
    id: `gid://shopify/Product/${p.id}`,
    handle: p.handle ?? `product-${p.id}`,
    title: p.title,
    descriptionHtml: p.descriptionHtml ?? null,
    productType: p.productType ?? null,
    status: p.status ?? "ACTIVE",
    onlineStoreUrl: null,
    featuredImage: p.imageUrl ? { url: p.imageUrl } : null,
    variants: {
      nodes: [{ price: p.price == null ? null : String(p.price), sku: p.sku ?? null }],
    },
  };
}

export function startShopifyApiMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  // token -> registered catalogue
  const catalogues = new Map<string, MockProductInput[]>();

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
      res.writeHead(204);
      return res.end();
    }

    if (url.pathname === "/admin/oauth/access_token" && req.method === "POST") {
      return readJsonBody(req, (body: { code?: string }) => {
        const code = body.code ?? "";
        if (code === "trigger-token-failure") {
          return send(400, { errors: "mock: invalid authorization code" });
        }
        send(200, { access_token: `shopify-token-${code}`, scope: "read_products" });
      });
    }

    if (/^\/admin\/api\/[^/]+\/graphql\.json$/.test(url.pathname) && req.method === "POST") {
      const token = String(req.headers["x-shopify-access-token"] ?? "");
      return readJsonBody(req, (body: { query?: string }) => {
        const query = body.query ?? "";
        if (token.includes("graphql-failure")) {
          return send(500, { errors: [{ message: "mock: graphql failure" }] });
        }
        if (query.includes("webhookSubscriptionCreate")) {
          return send(200, { data: { webhookSubscriptionCreate: { userErrors: [] } } });
        }
        if (query.includes("currencyCode")) {
          return send(200, { data: { shop: { name: "Mock Store", currencyCode: "BRL" } } });
        }
        if (query.includes("products(")) {
          const nodes = (catalogues.get(token) ?? []).map(toGraphqlNode);
          return send(200, {
            data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
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
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise((r) => server.close(() => r())),
      });
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
