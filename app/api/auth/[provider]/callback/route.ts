import { NextResponse } from "next/server"
import {
  clearLunarOAuthState,
  isLunarOAuthProvider,
  lunarAuthFailure,
  lunarAuthSuccess,
  lunarCallbackUrl,
  lunarOAuthConfig,
  validateLunarOAuthState,
  type LunarOAuthProvider,
  type LunarSessionUser,
} from "@/lib/lunar-auth"
import { resolveLunarAccountScope } from "@/lib/legacy-account-bridge"

export const runtime = "nodejs"

type TokenResponse = { access_token?: string }
type GitHubEmail = { email?: string; primary?: boolean; verified?: boolean }

function normaliseText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

async function exchangeCode(request: Request, provider: LunarOAuthProvider, code: string, codeVerifier: string | null) {
  const config = lunarOAuthConfig(provider)
  if (!config) return null

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: lunarCallbackUrl(request, provider),
    grant_type: "authorization_code",
  })
  if (codeVerifier) body.set("code_verifier", codeVerifier)

  const tokenUrl = provider === "google"
    ? "https://oauth2.googleapis.com/token"
    : provider === "discord"
      ? "https://discord.com/api/oauth2/token"
      : "https://github.com/login/oauth/access_token"

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  })
  if (!response.ok) return null
  const data = await response.json() as TokenResponse
  return normaliseText(data.access_token)
}

async function googleUser(accessToken: string): Promise<LunarSessionUser | null> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!response.ok) return null
  const profile = await response.json() as Record<string, unknown>
  const subject = normaliseText(profile.sub)
  const email = normaliseText(profile.email)
  if (!subject || !email || profile.email_verified !== true) return null
  return {
    sub: `google:${subject}`,
    name: normaliseText(profile.name),
    email,
    picture: normaliseText(profile.picture),
    provider: "google",
  }
}

async function discordUser(accessToken: string): Promise<LunarSessionUser | null> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!response.ok) return null
  const profile = await response.json() as Record<string, unknown>
  const subject = normaliseText(profile.id)
  const email = normaliseText(profile.email)
  if (!subject || !email || profile.verified !== true) return null
  const avatar = normaliseText(profile.avatar)
  const discriminator = normaliseText(profile.discriminator)
  const picture = avatar ? `https://cdn.discordapp.com/avatars/${subject}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}` : null
  return {
    sub: `discord:${subject}`,
    name: normaliseText(profile.global_name) ?? normaliseText(profile.username) ?? (discriminator ? `Discord user ${discriminator}` : null),
    email,
    picture,
    provider: "discord",
  }
}

async function githubUser(accessToken: string): Promise<LunarSessionUser | null> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Lunar",
    },
    cache: "no-store",
  })
  if (!response.ok) return null
  const profile = await response.json() as Record<string, unknown>
  const subject = typeof profile.id === "number" ? String(profile.id) : normaliseText(profile.id)
  if (!subject) return null

  let email = normaliseText(profile.email)
  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Lunar",
      },
      cache: "no-store",
    })
    if (emailsResponse.ok) {
      const emails = await emailsResponse.json() as GitHubEmail[]
      email = normaliseText(emails.find((entry) => entry.primary && entry.verified)?.email)
        ?? normaliseText(emails.find((entry) => entry.verified)?.email)
    }
  }
  if (!email) return null

  return {
    sub: `github:${subject}`,
    name: normaliseText(profile.name) ?? normaliseText(profile.login),
    email,
    picture: normaliseText(profile.avatar_url),
    provider: "github",
  }
}

async function providerUser(provider: LunarOAuthProvider, accessToken: string) {
  if (provider === "google") return googleUser(accessToken)
  if (provider === "discord") return discordUser(accessToken)
  return githubUser(accessToken)
}

function oauthFailure(request: Request, provider: LunarOAuthProvider, code: "cancelled" | "unavailable" | "failed" | "unverified", stage = "unknown") {
  console.warn(`[Lunar OAuth] callback failed provider=${provider} code=${code} stage=${stage}`)
  // In an installed/PWA flow the provider can return through a separate
  // browser context while the original Lunar session is already valid. Do
  // not replace that valid session with a frightening login error screen.
  const hasExistingSession = /(?:^|;\s*)lunar_session=/.test(request.headers.get("cookie") || "")
  const response = hasExistingSession
    ? NextResponse.redirect(new URL("/", request.url))
    : lunarAuthFailure(request, code)
  clearLunarOAuthState(response, provider)
  return response
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: requestedProvider } = await context.params
  if (!isLunarOAuthProvider(requestedProvider)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const provider = requestedProvider
  const url = new URL(request.url)

  if (url.searchParams.has("error")) return oauthFailure(request, provider, "cancelled", "provider_cancelled")
  const code = url.searchParams.get("code")
  if (!code) return oauthFailure(request, provider, "failed", "missing_code")
  const oauthState = await validateLunarOAuthState(request, provider)
  if (!oauthState) return oauthFailure(request, provider, "failed", "state_invalid")

  const accessToken = await exchangeCode(request, provider, code, oauthState.codeVerifier)
  if (!accessToken) return oauthFailure(request, provider, "failed", "token_exchange")
  const user = await providerUser(provider, accessToken)
  if (!user) return oauthFailure(request, provider, "unverified", "identity_unverified")

  const accountScope = await resolveLunarAccountScope(user)
  if (!accountScope) return oauthFailure(request, provider, "failed", "account_bridge")

  console.info(`[Lunar OAuth] callback success provider=${provider} account_scope=${accountScope.startsWith("user_") ? "legacy" : "new"}`)
  const response = await lunarAuthSuccess(request, user, accountScope)
  clearLunarOAuthState(response, provider)
  return response
}
