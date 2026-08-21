import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PublicProfileCard } from "@/components/public-profile-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Profile = {
  username: string;
  bio: string | null;
  profile_picture: string | null;
  background_media: string | null;
  background_media_type: "image" | "video" | null;
  music_url: string | null;
  music_name: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getProfile(username: string): Promise<Profile | null> {
  const normalized = username.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9_]{1,24}$/.test(normalized)) return null;
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("username,bio,profile_picture,background_media,background_media_type,music_url,music_name")
    .eq("username_lower", normalized.toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: "Profile not found · uncgpt" };
  return {
    title: `@${profile.username} · uncgpt`,
    description: profile.bio || `Public profile for @${profile.username} on uncgpt`,
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) notFound();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-10 text-white">
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
        />
      </section>
    </main>
  );
}
