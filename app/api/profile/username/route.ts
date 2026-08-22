import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{1,24}$/;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  const session = await getSession();
  const userId = session?.user?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Username storage is not configured yet." }, { status: 503 });

  const { data, error } = await supabase.from("user_profiles").select("username").eq("user_id", userId).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load username." }, { status: 500 });
  return NextResponse.json({ username: data?.username ?? null });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? "").trim().replace(/^@+/, "");
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Use 1–24 letters, numbers, or underscores." }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Username storage is not configured yet." }, { status: 503 });

  const { data: current } = await supabase.from("user_profiles").select("username").eq("user_id", userId).maybeSingle();
  if (current?.username?.toLowerCase() === username.toLowerCase()) return NextResponse.json({ username: current.username });

  const payload = { username, updated_at: new Date().toISOString() };
  const result = current
    ? await supabase.from("user_profiles").update(payload).eq("user_id", userId).select("username").single()
    : await supabase.from("user_profiles").insert({ user_id: userId, ...payload }).select("username").single();

  if (result.error) {
    if (result.error.code === "23505") return NextResponse.json({ error: "Username already claimed. Choose another one." }, { status: 409 });
    console.error("[profile/username] save failed", { code: result.error.code, message: result.error.message });
    return NextResponse.json({ error: "Unable to save username. Check the Supabase profile table configuration." }, { status: 500 });
  }
  return NextResponse.json({ username: result.data.username });
}
