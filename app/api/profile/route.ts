import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth0 } from "@/lib/auth0";

export const runtime = "nodejs";

const PROFILE_FIELDS = ["username", "bio", "profile_picture", "background_media", "background_media_type", "music_url", "music_name", "music_thumbnail", "cursor_image"] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];
const THUMBNAIL_MARKER = "__uncgpt_thumbnail__:";

function normalizeProfile<T extends Record<string, any> | null>(profile: T): T {
  if (!profile || typeof profile.music_name !== "string") return profile;
  const markerIndex = profile.music_name.indexOf(THUMBNAIL_MARKER);
  if (markerIndex < 0) return profile;
  const encodedThumbnail = profile.music_name.slice(markerIndex + THUMBNAIL_MARKER.length).trim();
  return { ...profile, music_name: profile.music_name.slice(0, markerIndex).trim() || null, music_thumbnail: profile.music_thumbnail || encodedThumbnail || null } as T;
}

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
  const withCursor = await supabase.from("user_profiles").select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name,music_thumbnail,cursor_image").eq("user_id", userId).maybeSingle();
  if (!withCursor.error) return NextResponse.json({ profile: normalizeProfile(withCursor.data ?? null) });
  const legacy = await supabase.from("user_profiles").select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name").eq("user_id", userId).maybeSingle();
  if (legacy.error) {
    console.error("[profile] load failed", { code: legacy.error.code, message: legacy.error.message });
    return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  }
  return NextResponse.json({ profile: normalizeProfile(legacy.data ?? null) });
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
      if (field === "username" && (value == null || String(value).trim() === "")) continue;
      update[field] = value == null ? null : String(value);
    }
  }
  if (typeof update.username === "string") {
    update.username = update.username.trim().replace(/^@+/, "");
    if (!/^[A-Za-z0-9_]{1,24}$/.test(update.username)) return NextResponse.json({ error: "Use 1–24 letters, numbers, or underscores." }, { status: 400 });
  }
  if (typeof update.bio === "string") update.bio = update.bio.slice(0, 160);
  if (update.background_media_type && !["image", "video"].includes(update.background_media_type)) {
    return NextResponse.json({ error: "Invalid background media type." }, { status: 400 });
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "No profile changes provided." }, { status: 400 });
  const cursorWasRequested = Object.prototype.hasOwnProperty.call(update, "cursor_image");
  const { cursor_image: cursorImage, ...coreUpdate } = update;
  const profileSelect = "username,bio,profile_picture,background_media,background_media_type,music_url,music_name,music_thumbnail";
  const { data: current } = await supabase.from("user_profiles").select("user_id,music_name").eq("user_id", userId).maybeSingle();
  let result = current
    ? await supabase.from("user_profiles").update({ ...coreUpdate, updated_at: new Date().toISOString() }).eq("user_id", userId).select(profileSelect).single()
    : await supabase.from("user_profiles").insert({ user_id: userId, username: `user_${userId.slice(-8)}`, ...coreUpdate }).select(profileSelect).single();
  if (result.error && Object.prototype.hasOwnProperty.call(coreUpdate, "music_thumbnail")) {
    const { music_thumbnail: _thumbnail, ...legacyUpdate } = coreUpdate;
    if (typeof _thumbnail === "string" && _thumbnail) legacyUpdate.music_name = `${String(legacyUpdate.music_name ?? current?.music_name ?? "").split(THUMBNAIL_MARKER)[0].trim()}\n${THUMBNAIL_MARKER}${_thumbnail}`;
    result = current
      ? await supabase.from("user_profiles").update({ ...legacyUpdate, updated_at: new Date().toISOString() }).eq("user_id", userId).select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name").single()
      : await supabase.from("user_profiles").insert({ user_id: userId, username: `user_${userId.slice(-8)}`, ...legacyUpdate }).select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name").single();
  }
  if (!result.error && cursorWasRequested && cursorImage !== undefined) {
    await supabase.from("user_profiles").update({ cursor_image: cursorImage, updated_at: new Date().toISOString() }).eq("user_id", userId);
  }
  if (result.error) {
    if (result.error.code === "23505" && "username" in update) return NextResponse.json({ error: "Username already claimed. Choose another one." }, { status: 409 });
    console.error("[profile] save failed", { code: result.error.code, message: result.error.message });
    return NextResponse.json({ error: "Unable to save profile." }, { status: 500 });
  }
  return NextResponse.json({ profile: normalizeProfile(result.data) });
}
