import { NextRequest, NextResponse } from "next/server";

const OAUTH_CONFIG = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    tokenUrl: "https://github.com/login/oauth/access_token",
  },
  linear: {
    clientId: process.env.LINEAR_CLIENT_ID || "",
    clientSecret: process.env.LINEAR_CLIENT_SECRET || "",
    tokenUrl: "https://api.linear.app/oauth/token",
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || "",
    clientSecret: process.env.SLACK_CLIENT_SECRET || "",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
  },
  notion: {
    clientId: process.env.NOTION_CLIENT_ID || "",
    clientSecret: process.env.NOTION_CLIENT_SECRET || "",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
  },
  google_drive: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  vercel: {
    clientId: process.env.VERCEL_CLIENT_ID || "",
    clientSecret: process.env.VERCEL_CLIENT_SECRET || "",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerParam } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.OAUTH_REDIRECT_BASE_URL || "https://unc-gptt.vercel.app";
  const fail = (message: string) => NextResponse.redirect(`${baseUrl}/?mcp_error=${encodeURIComponent(message)}`);
  
  if (!providerParam) {
    return fail("Provider parameter is required");
  }
  
  const provider = providerParam.toLowerCase();
  const config = OAUTH_CONFIG[provider as keyof typeof OAUTH_CONFIG];

  if (!config) {
    return fail("Unknown provider");
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return fail(`${provider} authorization was cancelled or denied: ${error}`);
  }

  if (!code) {
    return fail(`${provider} did not return an authorization code`);
  }

  const storedState = request.cookies.get(`oauth_state_${provider}`)?.value;
  
  if (!state || state !== storedState) {
    return fail(`${provider} authorization expired. Please try connecting again.`);
  }

  try {
    const redirectUri = `${baseUrl}/api/mcp/oauth/${provider}/callback`;

    let tokenResponse;
    let tokenData;

    if (provider === "slack") {
      const formData = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
      });

      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });
    } else if (provider === "notion") {
      const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
    } else {
      const formData = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
      });
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formData,
      });
    }

    tokenData = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok) {
      return fail(`${provider} token exchange failed. Check its OAuth callback URL and client credentials.`);
    }

    const accessToken = tokenData.access_token || tokenData.authed_user?.access_token;

    if (!accessToken) {
      return fail(`${provider} did not return an access token.`);
    }

    const response = NextResponse.redirect(`${baseUrl}/`);

    response.cookies.set(`mcp_oauth_${provider}`, accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    response.cookies.set(`mcp_oauth_${provider}_connected`, "1", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    response.cookies.delete(`oauth_state_${provider}`);

    return response;
  } catch (error) {
    // OAuth errors can contain provider response details; do not risk logging tokens.
    console.error(`OAuth callback error for ${provider}`);
    return fail(`${provider} connection failed unexpectedly. Please try again.`);
  }
}
