import { getTestEnv } from "./env";
import type { CapturedEmail } from "./email-mock";

// Reads / clears the emails captured by the mock Resend server that
// global-setup.ts started (its URL is in .test-env.json). The spawned
// next-dev process posts to the mock; tests read back through here.

export async function sentEmails(): Promise<CapturedEmail[]> {
  const res = await fetch(`${getTestEnv().emailMockUrl}/__sent`);
  return (await res.json()) as CapturedEmail[];
}

export async function clearEmails(): Promise<void> {
  await fetch(`${getTestEnv().emailMockUrl}/__sent`, { method: "DELETE" });
}

// Poll until an email to `to` shows up (sends are best-effort / not
// awaited by every caller). Returns it, or throws after the timeout.
export async function waitForEmail(to: string, timeoutMs = 3000): Promise<CapturedEmail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = (await sentEmails()).find((e) => e.to === to);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no email to ${to} within ${timeoutMs}ms`);
}
