import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PublicProfileCard, PublicProfileCursor } from "@/components/public-profile-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THUMBNAIL_MARKER = "__uncgpt_thumbnail__:";

type Profile = {
  username: string;
  bio: string | null;
  profile_picture: string | null;
  background_media: string | null;
  background_media_type: "image" | "video" | null;
  music_url: string | null;
  music_name: string | null;
  music_thumbnail: string | null;
  profile_views: number | null;
  cursor_image: string | null;
  is_verified?: boolean;
};

function normalizeProfile(profile: any): Profile {
  if (!profile || typeof profile.music_name !== "string") return profile as Profile;
  const markerIndex = profile.music_name.indexOf(THUMBNAIL_MARKER);
  if (markerIndex < 0) return profile as Profile;
  const encodedThumbnail = profile.music_name.slice(markerIndex + THUMBNAIL_MARKER.length).trim();
  return { ...profile, music_name: profile.music_name.slice(0, markerIndex).trim() || null, music_thumbnail: profile.music_thumbnail || encodedThumbnail || null } as Profile;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getProfile(username: string): Promise<Profile | null> {
  const normalized = username.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9_]{1,24}$/.test(normalized)) return null;
  if (normalized.toLowerCase() === "lunar") return { username: "lunar", bio: "The official Lunar profile.", profile_picture: "/lunar.png", background_media: null, background_media_type: null, music_url: null, music_name: null, music_thumbnail: null, profile_views: 0, cursor_image: null, is_verified: true };
  const supabase = getAdminClient();
  if (!supabase) return null;
  const selectFields = "username,bio,profile_picture,background_media,background_media_type,music_url,music_name,music_thumbnail,profile_views,cursor_image";
  const legacyFields = "username,bio,profile_picture,background_media,background_media_type,music_url,music_name,profile_views";
  const legacyFieldsNoViews = "username,bio,profile_picture,background_media,background_media_type,music_url,music_name";
  const primary = await supabase.from("user_profiles").select(selectFields).eq("username_lower", normalized.toLowerCase()).maybeSingle();
  if (primary.data) return normalizeProfile(primary.data);
  const fallback = await supabase.from("user_profiles").select(selectFields).eq("username", normalized).maybeSingle();
  if (fallback.data) return normalizeProfile(fallback.data);
  const legacyPrimary = await supabase.from("user_profiles").select(legacyFields).eq("username_lower", normalized.toLowerCase()).maybeSingle();
  if (legacyPrimary.data) return normalizeProfile(legacyPrimary.data);
  const legacyFallback = await supabase.from("user_profiles").select(legacyFields).eq("username", normalized).maybeSingle();
  if (legacyFallback.data) return normalizeProfile(legacyFallback.data);
  const noViewsPrimary = await supabase.from("user_profiles").select(legacyFieldsNoViews).eq("username_lower", normalized.toLowerCase()).maybeSingle();
  if (noViewsPrimary.data) return normalizeProfile(noViewsPrimary.data);
  const noViewsFallback = await supabase.from("user_profiles").select(legacyFieldsNoViews).eq("username", normalized).maybeSingle();
  if (!noViewsFallback.data) return null;
  return normalizeProfile(noViewsFallback.data);
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: "Profile not found · Lunar" };
  return {
    title: `@${profile.username} · Lunar`,
    description: profile.bio || `Public profile for @${profile.username} on Lunar`,
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) notFound();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-10 text-white">
      <PublicProfileCursor image={profile.cursor_image} />
      {profile.background_media && profile.background_media_type === "image" && (
        <div className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${profile.background_media})` }} />
      )}
      {profile.background_media && profile.background_media_type === "video" && (
        <video className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-35" src={profile.background_media} autoPlay muted loop playsInline />
      )}
      <div className="pointer-events-none fixed inset-0 bg-black/55" />
      <section className="relative mx-auto w-full max-w-[650px]">
        <PublicProfileCard
          username={profile.username}
          bio={profile.bio}
          profilePicture={profile.profile_picture}
          musicUrl={profile.music_url}
          musicName={profile.music_name}
          musicThumbnail={profile.music_thumbnail}
          profileViews={profile.profile_views ?? 0}
          isVerified={profile.is_verified ?? profile.username.toLowerCase() === "lunar"}
        />
      </section>
    </main>
  );
}
