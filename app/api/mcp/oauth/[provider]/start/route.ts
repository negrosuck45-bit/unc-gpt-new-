import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * OAuth start route — redirects user to the provider's authorization page.
 * Credentials for GitHub, Linear, and Slack are hard-coded (already registered).
 * Notion, Google Drive, and Vercel use env vars so the operator can supply their own app.
 */

const OAUTH_CONFIG: Record<string, {
  clientId: string;
  clientSecret?: string;
  authUrl: string;
  scopes: string[];
}> = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authUrl: "https://github.com/login/oauth/authorize",
    scopes: ["repo", "user", "read:org"],
  },
  linear: {
    clientId: process.env.LINEAR_CLIENT_ID || "",
    clientSecret: process.env.LINEAR_CLIENT_SECRET,
    authUrl: "https://linear.app/oauth/authorize",
    scopes: ["read", "write", "issues:create"],
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || "",
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    authUrl: "https://slack.com/oauth/v2/authorize",
    scopes: ["chat:write", "channels:read", "channels:history", "users:read"],
  },
  notion: {
    clientId: process.env.NOTION_CLIENT_ID || "",
    clientSecret: process.env.NOTION_CLIENT_SECRET || "",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    scopes: [],  // Notion uses workspace-level grants, not scopes
  },
  google_drive: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  },
  vercel: {
    clientId: process.env.VERCEL_CLIENT_ID || "",
    clientSecret: process.env.VERCEL_CLIENT_SECRET || "",
    authUrl: "https://vercel.com/oauth/authorize",
    scopes: [],
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerParam } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.OAUTH_REDIRECT_BASE_URL || "https://unc-gptt.vercel.app";
  const fail = (message: string) => NextResponse.redirect(`${appUrl}/?mcp_error=${encodeURIComponent(message)}`);

  if (!providerParam) {
    return fail("Provider parameter is required");
  }

  const provider = providerParam.toLowerCase();
  const config = OAUTH_CONFIG[provider];

  if (!config) {
    return fail("Unknown provider");
  }

  if (!config.clientId) {
    return fail(`${provider} OAuth is not configured. Add its client ID and secret in Vercel environment variables.`);
  }

  const baseUrl = appUrl;
  const redirectUri = `${baseUrl}/api/mcp/oauth/${provider}/callback`;
  const state = randomBytes(32).toString("hex");

  const queryParams = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  });

  // Provider-specific scope formatting
  if (provider === "slack") {
    queryParams.set("scope", "");
    queryParams.set("user_scope", config.scopes.join(","));
  } else if (provider === "notion") {
    queryParams.set("owner", "user");
  } else if (config.scopes.length > 0) {
    queryParams.set("scope", config.scopes.join(provider === "google_drive" ? " " : " "));
  }

  const authUrl = `${config.authUrl}?${queryParams.toString()}`;
  const response = NextResponse.redirect(authUrl);

  response.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 600,
  });

  return response;
}
