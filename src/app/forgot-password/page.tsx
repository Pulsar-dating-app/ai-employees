import { redirect } from "next/navigation";

// Same pattern as /login and /sign-up: not a real page, just a stable,
// linkable URL that resolves to the landing with the auth overlay open.
export default function ForgotPasswordPage() {
  redirect("/?auth=forgot-password");
}
