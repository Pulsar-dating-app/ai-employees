import { redirect } from "next/navigation";

// Sign-up is an overlay on the landing, not its own page.
export default function SignUpPage() {
  redirect("/?auth=signup");
}
