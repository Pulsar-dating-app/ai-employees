import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";

// Placeholder proving session persistence end to end — the real onboarding
// shell (Hire Malu -> Teach Malu -> Connect WhatsApp) is Trello ticket F1.
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">You&apos;re logged in</h1>
      <p className="text-sm text-neutral-500">{user?.email}</p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
