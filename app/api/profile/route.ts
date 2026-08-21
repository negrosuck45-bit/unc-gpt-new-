import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth0 } from "@/lib/auth0";

export const runtime = "nodejs";

const PROFILE_FIELDS = ["bio", "profile_picture", "background_media", "background_media_type", "music_url", "music_name", "cursor_image"] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getUserId() {
  const session = await auth0.getSession();
  return session?.user?.sub ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Profile storage is not configured." }, { status: 503 });
  const withCursor = await supabase.from("user_profiles").select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name,cursor_image").eq("user_id", userId).maybeSingle();
  if (!withCursor.error) return NextResponse.json({ profile: withCursor.data ?? null });
  const legacy = await supabase.from("user_profiles").select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name").eq("user_id", userId).maybeSingle();
  if (legacy.error) {
    console.error("[profile] load failed", { code: legacy.error.code, message: legacy.error.message });
    return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  }
  return NextResponse.json({ profile: legacy.data ?? null });
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Profile storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const update: Record<string, string | null> = {};
  for (const field of PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body ?? {}, field)) {
      const value = body?.[field];
      update[field] = value == null ? null : String(value);
    }
  }
  if (typeof update.bio === "string") update.bio = update.bio.slice(0, 160);
  if (update.background_media_type && !["image", "video"].includes(update.background_media_type)) {
    return NextResponse.json({ error: "Invalid background media type." }, { status: 400 });
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "No profile changes provided." }, { status: 400 });
  const { data: current } = await supabase.from("user_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  let result = current
    ? await supabase.from("user_profiles").update({ ...update, updated_at: new Date().toISOString() }).eq("user_id", userId).select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name,cursor_image").single()
    : await supabase.from("user_profiles").insert({ user_id: userId, username: `user_${userId.slice(-8)}`, ...update }).select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name,cursor_image").single();
  if (result.error && "cursor_image" in update) {
    const { cursor_image: _ignoredCursor, ...legacyUpdate } = update;
    result = current
      ? await supabase.from("user_profiles").update({ ...legacyUpdate, updated_at: new Date().toISOString() }).eq("user_id", userId).select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name").single()
      : await supabase.from("user_profiles").insert({ user_id: userId, username: `user_${userId.slice(-8)}`, ...legacyUpdate }).select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name").single();
  }
  if (result.error) {
    console.error("[profile] save failed", { code: result.error.code, message: result.error.message });
    return NextResponse.json({ error: "Unable to save profile." }, { status: 500 });
  }
  return NextResponse.json({ profile: result.data });
}
