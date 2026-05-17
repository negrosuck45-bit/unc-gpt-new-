import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * OAuth start route — redirects user to the provider's authorization page.
 * Credentials for GitHub, Linear, and Slack are hard-coded (already registered).
 * Notion, Google Drive, and Vercel use env vars so the operator can supply their own app.
 */

const OAUTH_CONFIG: Record<string, {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  scopes: string[];
}> = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "Ov23liEIVtsLZnu1vy8K",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "594ad5a6b65f230e50f3495be5c7451d0ea81f11",
    authUrl: "https://github.com/login/oauth/authorize",
    scopes: ["repo", "user", "read:org"],
  },
  linear: {
    clientId: process.env.LINEAR_CLIENT_ID || "f977b36deb20417ea5a13400c7fc7ed7",
    clientSecret: process.env.LINEAR_CLIENT_SECRET || "af95b0553d0dc9c00f98f3e5f7d5194b",
    authUrl: "https://linear.app/oauth/authorize",
    scopes: ["read", "write", "issues:create"],
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || "11100863267972.11095194503062",
    clientSecret: process.env.SLACK_CLIENT_SECRET || "c6f76d0fda5d6dbcbbae722cf3da0e8c",
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
  if (!providerParam) {
    return NextResponse.json({ error: "Provider parameter is required" }, { status: 400 });
  }

  const provider = providerParam.toLowerCase();
  const config = OAUTH_CONFIG[provider];

  if (!config) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  if (!config.clientId) {
    return NextResponse.json(
      { error: `${provider} OAuth not configured. Set ${provider.toUpperCase()}_CLIENT_ID in your environment.` },
      { status: 400 }
    );
  }

  const baseUrl = process.env.OAUTH_REDIRECT_BASE_URL || "https://unc-gpt.vercel.app";
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
