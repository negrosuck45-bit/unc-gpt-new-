import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnabledComposioToolkits } from "@/lib/composio";

const PROVIDERS = ["github", "linear", "slack", "notion", "google_drive", "gmail", "google_calendar", "vercel"];
const COMPOSIO_ALIASES: Record<string, string[]> = {
  github: ["github"],
  linear: ["linear"],
  slack: ["slack"],
  notion: ["notion"],
  google_drive: ["google_drive", "googledrive", "google-drive"],
  gmail: ["gmail", "google_mail", "googlemail"],
  google_calendar: ["google_calendar", "googlecalendar", "google-calendar"],
  vercel: ["vercel"],
};

type ConnectorStatus = {
  connected: boolean;
  configured: boolean;
  stale?: boolean;
  connectedVia?: "oauth" | "composio";
};

export async function GET(request: NextRequest) {
  const status: Record<string, ConnectorStatus> = {};
  let composioToolkits = new Set<string>();

  // OAuth cookies remain the fastest source of truth for the native adapters.
  // Composio is checked server-side as well because its account is user-scoped and
  // does not create an mcp_oauth_* cookie in this app.
  try {
    const session = await getSession();
    if (session?.user?.sub && process.env.COMPOSIO_API_KEY) {
      const liveToolkits = await getEnabledComposioToolkits(session.user.sub);
      composioToolkits = new Set(liveToolkits.map((toolkit) => String(toolkit).toLowerCase().replace(/[- ]/g, "_")));
    }
  } catch (error) {
    console.warn("Unable to merge live Composio status into OAuth status:", error);
  }

  for (const provider of PROVIDERS) {
    const hasToken = !!request.cookies.get(`mcp_oauth_${provider}`)?.value;
    const hasConnectedMarker = !!request.cookies.get(`mcp_oauth_${provider}_connected`)?.value;
    const composioConnected = (COMPOSIO_ALIASES[provider] || [provider]).some((alias) => composioToolkits.has(alias.replace(/[- ]/g, "_")));
    const envPrefix = provider.toUpperCase();
    const oauthConfigured = !!process.env[`${envPrefix}_CLIENT_ID`] && !!process.env[`${envPrefix}_CLIENT_SECRET`];

    status[provider] = {
      connected: hasToken || composioConnected,
      configured: oauthConfigured || Boolean(process.env.COMPOSIO_API_KEY),
      stale: !hasToken && !composioConnected && hasConnectedMarker,
      connectedVia: hasToken ? "oauth" : composioConnected ? "composio" : undefined,
    };
  }

  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
