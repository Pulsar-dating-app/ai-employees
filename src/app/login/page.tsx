import { redirect } from "next/navigation";

// Login is an overlay on the landing, not its own page. Deep links, the
// logged-out `/dashboard` bounce, and `logout()` all land here and resolve
// to the landing with the auth overlay open.
export default function LoginPage() {
  redirect("/?auth=login");
}
