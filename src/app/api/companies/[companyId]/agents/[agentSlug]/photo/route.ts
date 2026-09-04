import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Agent photo customization -- pick one of the two curated defaults for
// this agent, or upload a custom portrait. Mirrors the embed widget's
// customization route (.../widget/route.ts) field-for-field: one endpoint
// saves type + an optional new file in a single POST, same FormData shape,
// same storage-path convention, same best-effort orphan cleanup.
//
// Member-gated, not admin-only: cosmetic content (like the widget launcher
// or a product photo), not a security-sensitive toggle.

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VALID_PHOTO_TYPES = ["default_1", "default_2", "custom"] as const;
type PhotoType = (typeof VALID_PHOTO_TYPES)[number];

const BUCKET = "agent-photos";

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

// Same recovery trick as the widget route: the stored value is a public
// URL, not the storage path -- this reverses it so a replaced/reverted
// asset can be deleted. Best-effort; any surprise in the URL shape just
// leaves the old file lingering rather than failing the request.
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

  const photoType = formData.get("photoType");
  if (typeof photoType !== "string" || !VALID_PHOTO_TYPES.includes(photoType as PhotoType)) {
    return NextResponse.json(
      { error: `photoType must be one of: ${VALID_PHOTO_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  const { data: existing, error: existingError } = await supabase
    .from("company_agents")
    .select("photo_asset_url")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "This team member hasn't been hired" }, { status: 404 });
  }

  const previousAssetUrl = existing.photo_asset_url as string | null;
  let newAssetUrl: string | null = previousAssetUrl;

  if (photoType !== "custom") {
    newAssetUrl = null;
  } else if (file instanceof File) {
    const ext = IMAGE_MIME_EXT[file.type];

    if (!ext) {
      const allowed = Object.keys(IMAGE_MIME_EXT).join(", ");
      return NextResponse.json({ error: `Unsupported file type. Allowed: ${allowed}` }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB limit` },
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
    // Chose "custom" but never uploaded anything and nothing exists to fall
    // back on -- e.g. selecting the option without picking a file.
    return NextResponse.json({ error: "Upload a photo first" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("company_agents")
    .update({ photo_type: photoType, photo_asset_url: newAssetUrl })
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
