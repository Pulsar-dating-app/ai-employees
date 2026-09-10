import { redirect } from "next/navigation";

// The My Team list moved to /dashboard (2026-09-10, merged with the old
// Marketplace -- see that page's own comment and the 2026-09-10
// decisions.md entry). This route stays as a redirect stub rather than
// being deleted: my-agents/[agentSlug]/page.tsx (the per-agent Connections
// page, unchanged) still has several `<BackLink href="/dashboard/my-agents">`
// calls, and a redirect here means that unrelated file needs zero edits.
export default function MyAgentsRedirect() {
  redirect("/dashboard");
}
