import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth";
import {
  getConnectionPlatform,
  isSafeConnectionUrl,
  sanitizeConnectionValue,
  type ConnectionMode,
  type ConnectionPlatform,
} from "@/lib/profile-connections";

export const runtime = "nodejs";

const MAX_CONNECTIONS = 30;
const MAX_VALUE_LENGTH = 512;

type ConnectionPayload = {
  id?: unknown;
  platform?: unknown;
  mode?: unknown;
  value?: unknown;
  position?: unknown;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getUserId() {
  const session = await getSession();
  return session?.user?.sub ?? null;
}

function parseConnection(payload: ConnectionPayload) {
  const platform = typeof payload.platform === "string" ? getConnectionPlatform(payload.platform) : undefined;
  if (!platform) return { error: "Choose a supported platform." } as const;

  const mode = payload.mode;
  if (mode !== platform.mode) return { error: "The connection type does not match that platform." } as const;

  if (typeof payload.value !== "string") return { error: "Enter a connection value." } as const;
  const value = sanitizeConnectionValue(payload.value);
  if (!value) return { error: platform.mode === "link" ? "Enter a profile link." : "Enter a username." } as const;
  if (value.length > MAX_VALUE_LENGTH) return { error: "Connection values must be 512 characters or fewer." } as const;
  if (platform.mode === "link" && !isSafeConnectionUrl(value)) return { error: "Use a valid http or https profile link." } as const;
  if (platform.mode === "username" && /[\r\n]/.test(value)) return { error: "Usernames cannot contain line breaks." } as const;

  return {
    platform: platform.id as ConnectionPlatform,
    mode: platform.mode as ConnectionMode,
    value,
  } as const;
}

function unavailableResponse(message?: string) {
  return NextResponse.json({ error: message || "Connections storage is not configured." }, { status: 503 });
}

function connectionDatabaseError(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  if (error?.code === "22P02") {
    return NextResponse.json(
      { error: "Connections storage needs the latest database migration. Run the connections repair migration, then try again." },
      { status: 500 },
    );
  }
  return unavailableResponse(fallback);
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return unavailableResponse();

  const { data, error } = await supabase
    .from("connections")
    .select("id,platform,mode,value,position,created_at")
    .eq("user_id", userId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[connections] load failed", { code: error.code, message: error.message });
    return connectionDatabaseError(error, "Unable to load connections.");
  }

  return NextResponse.json({ connections: data ?? [] });
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return unavailableResponse();

  const body = await request.json().catch(() => null) as ConnectionPayload | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parseConnection(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count, error: countError } = await supabase
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) return connectionDatabaseError(countError, "Unable to create a connection.");
  if ((count ?? 0) >= MAX_CONNECTIONS) return NextResponse.json({ error: `You can add up to ${MAX_CONNECTIONS} connections.` }, { status: 400 });

  const { data: latest, error: latestError } = await supabase
    .from("connections")
    .select("position")
    .eq("user_id", userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return connectionDatabaseError(latestError, "Unable to create a connection.");

  const { data, error } = await supabase
    .from("connections")
    .insert({ user_id: userId, ...parsed, position: Number(latest?.position ?? -1) + 1 })
    .select("id,platform,mode,value,position,created_at")
    .single();
  if (error) {
    console.error("[connections] create failed", { code: error.code, message: error.message });
    return connectionDatabaseError(error, "Unable to create a connection.");
  }

  return NextResponse.json({ connection: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return unavailableResponse();

  const body = await request.json().catch(() => null) as ConnectionPayload | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Choose a connection to update." }, { status: 400 });

  const { data: current, error: currentError } = await supabase
    .from("connections")
    .select("id,platform,mode,value,position")
    .eq("id", body.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (currentError) return unavailableResponse("Unable to update the connection.");
  if (!current) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "value")) {
    const parsed = parseConnection({ platform: current.platform, mode: current.mode, value: body.value });
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update.value = parsed.value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "position")) {
    const position = Number(body.position);
    if (!Number.isInteger(position) || position < 0 || position > MAX_CONNECTIONS) return NextResponse.json({ error: "Invalid connection position." }, { status: 400 });
    update.position = position;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "No connection changes provided." }, { status: 400 });

  const { data, error } = await supabase
    .from("connections")
    .update(update)
    .eq("id", current.id)
    .eq("user_id", userId)
    .select("id,platform,mode,value,position,created_at")
    .single();
  if (error) return unavailableResponse("Unable to update the connection.");

  return NextResponse.json({ connection: data });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return unavailableResponse();

  const body = await request.json().catch(() => null) as ConnectionPayload | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Choose a connection to remove." }, { status: 400 });

  const { error, count } = await supabase
    .from("connections")
    .delete({ count: "exact" })
    .eq("id", body.id)
    .eq("user_id", userId);
  if (error) return unavailableResponse("Unable to remove the connection.");
  if (!count) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
