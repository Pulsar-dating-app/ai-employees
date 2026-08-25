import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Get current user" endpoint (Trello ticket A2) for clients that need to
// check auth state without rendering a Server Component — e.g. client-side
// nav, or a future non-web caller.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
