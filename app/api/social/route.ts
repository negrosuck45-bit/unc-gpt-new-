import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth0 } from "@/lib/auth0";

export const runtime = "nodejs";

function db() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null; }

export async function GET(request: NextRequest) {
  const session = await auth0.getSession();
  const userId = session?.user?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = db();
  if (!client) return NextResponse.json({ notifications: [], messages: [], following: false });
  const type = request.nextUrl.searchParams.get("type");
  if (type === "relationship") { const username = request.nextUrl.searchParams.get("username")?.toLowerCase(); if (!username || username === "uncgpt") return NextResponse.json({ following: false }); const { data: target } = await client.from("user_profiles").select("user_id").eq("username_lower", username).maybeSingle(); if (!target) return NextResponse.json({ following: false }); const { data } = await client.from("profile_follows").select("status").eq("follower_id", userId).eq("following_id", target.user_id).maybeSingle(); return NextResponse.json({ following: Boolean(data) }); }
  const [{ data: notifications }, { data: messages }, { data: suggestions }, { data: follows }] = await Promise.all([client.from("profile_notifications").select("id,sender_username,kind,body,created_at").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(50), client.from("profile_messages").select("id,sender_id,sender_username,thread_username,body,created_at").or(`recipient_id.eq.${userId},sender_id.eq.${userId}`).order("created_at", { ascending: true }).limit(100), client.from("user_profiles").select("user_id,username,profile_picture,bio").neq("user_id", userId).neq("username_lower", "uncgpt").limit(30), client.from("profile_follows").select("following_id,following_username,status").eq("follower_id", userId)]);
  const followingIds = new Set((follows || []).map((follow: any) => follow.following_id));
  const friends = (suggestions || []).filter((profile: any) => followingIds.has(profile.user_id)).map((profile: any) => ({ username: profile.username, profile_picture: profile.profile_picture, bio: profile.bio }));
  const filteredSuggestions = (suggestions || []).filter((profile: any) => !followingIds.has(profile.user_id)).map((profile: any) => ({ username: profile.username, profile_picture: profile.profile_picture, bio: profile.bio }));
  return NextResponse.json({ userId, notifications: notifications || [], messages: messages || [], friends, suggestions: filteredSuggestions });
}

export async function POST(request: NextRequest) {
  const session = await auth0.getSession(); const senderId = session?.user?.sub;
  if (!senderId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json(); const username = typeof body?.username === "string" ? body.username.trim().replace(/^@+/, "") : ""; const action = body?.action; const client = db();
  if (!client || !/^[A-Za-z0-9_]{1,24}$/.test(username)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (username.toLowerCase() === "uncgpt") return NextResponse.json({ error: "The official @uncgpt account cannot receive follows or messages." }, { status: 403 });
  const [{ data: sender }, { data: target }] = await Promise.all([client.from("user_profiles").select("username").eq("user_id", senderId).maybeSingle(), client.from("user_profiles").select("user_id,username").eq("username_lower", username.toLowerCase()).maybeSingle()]);
  if (!target) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  const senderUsername = sender?.username || session.user.name || "Someone";
  if (action === "follow") { await client.from("profile_follows").upsert({ follower_id: senderId, following_id: target.user_id, following_username: target.username, status: "pending" }, { onConflict: "follower_id,following_id" }); await client.from("profile_notifications").insert({ recipient_id: target.user_id, sender_id: senderId, sender_username: senderUsername, kind: "follow", body: `@${senderUsername} wants to follow you.` }); return NextResponse.json({ ok: true }); }
  if (action === "message") { const text = typeof body?.text === "string" ? body.text.trim() : ""; if (!text) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 }); await client.from("profile_messages").insert({ recipient_id: target.user_id, sender_id: senderId, thread_username: target.username, sender_username: senderUsername, body: text }); await client.from("profile_notifications").insert({ recipient_id: target.user_id, sender_id: senderId, sender_username: senderUsername, kind: "message", body: text }); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
