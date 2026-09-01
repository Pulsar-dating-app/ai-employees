import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Embed widget customization -- Customize screen (Stitch "Customize
// Embedded Agent - Admin Workspace"). One endpoint saves the whole form at
// once (greeting + launcher choice + an optional new file), matching
// ImportPanel's single-POST-with-FormData shape rather than splitting
// "upload" and "save" into two round trips.
//
// Member-gated, not admin-only: this is cosmetic content (like editing a
// product or a policy field), not a security-sensitive toggle the way
// pause/activate or the human-handoff switch are.

const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const VIDEO_MIME_EXT: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
};

const IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VALID_LAUNCHER_TYPES = ["default", "video", "image"] as const;
type LauncherType = (typeof VALID_LAUNCHER_TYPES)[number];

const BUCKET = "widget-assets";

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }

  return { error: null };
}

async function getAgentBySlug(supabase: Awaited<ReturnType<typeof createClient>>, slug: string) {
  const { data: agent, error } = await supabase.from("agents").select("id").eq("slug", slug).maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  }

  return { agentId: agent.id as string, error: null };
}

// The stored value is a public URL (https://.../storage/v1/object/public/widget-assets/{path}),
// not the storage path itself -- this recovers the path so a replaced/reverted
// asset can be deleted. Best-effort only: any surprise in the URL shape (a
// value from a previous, differently-shaped asset host, say) just means the
// old file lingers in the bucket rather than the request failing.
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; agentSlug: string }> },
) {
  const { companyId, agentSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const agentLookup = await getAgentBySlug(supabase, agentSlug);
  if (agentLookup.error) return agentLookup.error;
  const agentId = agentLookup.agentId!;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const launcherType = formData.get("launcherType");
  if (typeof launcherType !== "string" || !VALID_LAUNCHER_TYPES.includes(launcherType as LauncherType)) {
    return NextResponse.json(
      { error: `launcherType must be one of: ${VALID_LAUNCHER_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const greetingRaw = formData.get("greeting");
  const greeting = typeof greetingRaw === "string" && greetingRaw.trim() ? greetingRaw.trim() : null;

  const file = formData.get("file");

  const { data: existing, error: existingError } = await supabase
    .from("company_agents")
    .select("widget_launcher_asset_url")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "This team member hasn't been hired" }, { status: 404 });
  }

  const previousAssetUrl = existing.widget_launcher_asset_url as string | null;
  let newAssetUrl: string | null = previousAssetUrl;

  if (launcherType === "default") {
    newAssetUrl = null;
  } else if (file instanceof File) {
    const mimeMap = launcherType === "video" ? VIDEO_MIME_EXT : IMAGE_MIME_EXT;
    const maxBytes = launcherType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const ext = mimeMap[file.type];

    if (!ext) {
      const allowed = Object.keys(mimeMap).join(", ");
      return NextResponse.json({ error: `Unsupported file type. Allowed: ${allowed}` }, { status: 400 });
    }
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit` },
        { status: 400 },
      );
    }

    const path = `${companyId}/${agentId}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    newAssetUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } else if (!previousAssetUrl) {
    // Chose "video"/"image" but never uploaded anything and nothing exists
    // to fall back on -- e.g. selecting the option without picking a file.
    return NextResponse.json({ error: "Upload an image or video first" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("company_agents")
    .update({
      widget_greeting: greeting,
      widget_launcher_type: launcherType,
      widget_launcher_asset_url: newAssetUrl,
    })
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Best-effort cleanup, after the row is safely updated -- a delete failure
  // here just leaves an orphaned file in the bucket, never breaks the save.
  if (previousAssetUrl && previousAssetUrl !== newAssetUrl) {
    const oldPath = storagePathFromPublicUrl(previousAssetUrl);
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }
  }

  return NextResponse.json({ companyAgent: updated });
}
