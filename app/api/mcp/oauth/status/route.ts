import { NextRequest, NextResponse } from "next/server";

const PROVIDERS = ["github", "linear", "slack", "notion", "google_drive", "vercel"];

export async function GET(request: NextRequest) {
  const status: Record<string, { connected: boolean; configured: boolean; stale?: boolean }> = {};

  for (const provider of PROVIDERS) {
    // Only a token can execute an external action. The helper cookie is kept as
    // a diagnostic signal so the UI can explain that the account needs a fresh
    // authorization instead of falsely presenting it as usable.
    const hasToken = !!request.cookies.get(`mcp_oauth_${provider}`)?.value;
    const hasConnectedMarker = !!request.cookies.get(`mcp_oauth_${provider}_connected`)?.value;

    const envPrefix = provider.toUpperCase();
    const isConfigured = !!process.env[`${envPrefix}_CLIENT_ID`] && !!process.env[`${envPrefix}_CLIENT_SECRET`];

    status[provider] = { connected: hasToken, configured: isConfigured, stale: !hasToken && hasConnectedMarker };
  }

  return NextResponse.json(status);
}
