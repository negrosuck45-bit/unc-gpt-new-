import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim().replace(/^@+/, "") || "";
  if (!/^[A-Za-z0-9_]{1,24}$/.test(username)) return NextResponse.redirect(new URL("/stram-mark.svg", request.url));
  if (username.toLowerCase() === "stram") return NextResponse.redirect(new URL("/stram-mark.svg", request.url));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.redirect(new URL("/stram-mark.svg", request.url));
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await supabase.from("user_profiles").select("profile_picture").eq("username_lower", username.toLowerCase()).maybeSingle();
  const picture = typeof data?.profile_picture === "string" && data.profile_picture ? data.profile_picture : "/stram-mark.svg";
  return NextResponse.redirect(picture.startsWith("http") ? picture : new URL(picture, request.url));
}
