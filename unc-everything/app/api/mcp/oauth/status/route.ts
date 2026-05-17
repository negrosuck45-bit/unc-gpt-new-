import { NextRequest, NextResponse } from "next/server";

const PROVIDERS = ["github", "linear", "slack", "notion", "google_drive", "vercel"];

export async function GET(request: NextRequest) {
  const status: Record<string, { connected: boolean; configured: boolean }> = {};

  for (const provider of PROVIDERS) {
    // Check both the token cookie AND the _connected helper cookie
    const hasToken     = !!request.cookies.get(`mcp_oauth_${provider}`)?.value;
    const hasConnected = !!request.cookies.get(`mcp_oauth_${provider}_connected`)?.value;
    const isConnected  = hasToken || hasConnected;

    // configured = env var set OR OAuth creds hard-coded in start/route.ts
    const hardCoded    = ["github", "linear", "slack"].includes(provider);
    const isConfigured = hardCoded || !!process.env[`${provider.toUpperCase()}_CLIENT_ID`];

    status[provider] = { connected: isConnected, configured: isConfigured };
  }

  return NextResponse.json(status);
}
