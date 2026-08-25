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
  return { status: res.status, json };
}
