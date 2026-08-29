import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body?.username === "string" ? body.username.trim().replace(/^@+/, "") : "";
    if (!/^[A-Za-z0-9_]{1,24}$/.test(username)) return NextResponse.json({ error: "Invalid username." }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ views: 0 }, { status: 200 });
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabase.rpc("increment_profile_views", { profile_username: username });
    if (error) {
      const { data: profile } = await supabase.from("user_profiles").select("profile_views").eq("username", username).maybeSingle();
      console.warn("[profile-view] counter update unavailable; returning the current stored value", { code: error.code });
      return NextResponse.json({ views: Number(profile?.profile_views ?? 0), degraded: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ views: Number(data ?? 0) });
  } catch {
    return NextResponse.json({ views: 0 }, { status: 200 });
  }
}
