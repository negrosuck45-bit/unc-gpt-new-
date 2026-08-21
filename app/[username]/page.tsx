import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

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

  const initial = profile.username.slice(0, 1).toUpperCase();
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-10 text-white">
      {profile.background_media && profile.background_media_type === "image" && (
        <div className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${profile.background_media})` }} />
      )}
      {profile.background_media && profile.background_media_type === "video" && (
        <video className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-35" src={profile.background_media} autoPlay muted loop playsInline />
      )}
      <div className="pointer-events-none fixed inset-0 bg-black/55" />
      <section className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-white/10 bg-black/45 p-7 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-10">
          <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-emerald-500/80 text-4xl font-medium shadow-xl shadow-black/30">
            {profile.profile_picture ? <img src={profile.profile_picture} alt={`@${profile.username}`} className="h-full w-full object-cover" /> : initial}
          </div>
          <h1 className="mt-5 text-2xl font-medium tracking-tight">@{profile.username}</h1>
          {profile.bio && <p className="mx-auto mt-3 max-w-md whitespace-pre-wrap text-sm leading-6 text-white/65">{profile.bio}</p>}
          {profile.music_url && (
            <div className="mx-auto mt-7 max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left">
              <div className="mb-2 truncate text-xs text-white/55">{profile.music_name || "Profile music"}</div>
              <audio className="h-9 w-full" src={profile.music_url} controls />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
