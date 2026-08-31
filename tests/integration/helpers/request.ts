import { getTestEnv } from "./env";

export interface ApiResult<T = unknown> {
  status: number;
  json: T;
}

// Thin fetch wrapper against the test Next.js server booted by
// global-setup.ts. `cookie` is a TestUser.cookieHeader, or omitted to hit
// the endpoint unauthenticated.
export async function api<T = unknown>(
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const { baseUrl } = getTestEnv();
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as T;

  // A 500 is never an expected outcome in this suite — 502 is (the Graph API
  // and Google mocks return it deliberately), so only 500 throws. Without
  // this, a server error surfaced three frames later as "Cannot read
  // properties of undefined (reading 'id')" wherever the caller reached into
  // the body, which is how a CI failure stayed unexplained for two days.
  if (res.status === 500) {
    throw new Error(`${method} ${path} -> 500 ${JSON.stringify(json)}`);
  }

  return { status: res.status, json };
}
