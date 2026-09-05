import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jwtVerify, SignJWT } from "jose"

export const LUNAR_SESSION_COOKIE = "stram_session"
const LEGACY_SESSION_COOKIE = "lunar_session"
const SESSION_ISSUER = "lunar"
const SESSION_AUDIENCE = "lunar-web"
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30
const OAUTH_STATE_DURATION_SECONDS = 60 * 10

export const LUNAR_OAUTH_PROVIDERS = ["google", "discord", "github"] as const
export type LunarOAuthProvider = (typeof LUNAR_OAUTH_PROVIDERS)[number]

export type LunarSessionUser = {
  sub: string
  name: string | null
  email: string
  picture: string | null
  avatarDecoration: string | null
  provider: LunarOAuthProvider
}

export type LunarSession = LunarSessionUser & {
  accountScope: string
}

function isProduction() {
  return process.env.NODE_ENV === "production"
}

function authSecret() {
  const secret = process.env.LUNAR_AUTH_SECRET
  if (!secret || secret.length < 32) return null
  return new TextEncoder().encode(secret)
}

function stateCookieName(provider: LunarOAuthProvider) {
  return `stram_oauth_state_${provider}`
}

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function randomState() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

type LunarOAuthState = {
  state: string
  codeVerifier: string | null
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge,
  }
}

function providerStateCookieOptions() {
  return sessionCookieOptions(OAUTH_STATE_DURATION_SECONDS)
}

function isLegacyClerkUserId(value: unknown): value is string {
  return typeof value === "string" && /^user_[A-Za-z0-9]+$/.test(value)
}

function isValidAccountScope(scope: unknown, providerSubject: string) {
  return scope === providerSubject || isLegacyClerkUserId(scope)
}

export function isLunarOAuthProvider(value: string | null): value is LunarOAuthProvider {
  return Boolean(value && LUNAR_OAUTH_PROVIDERS.includes(value as LunarOAuthProvider))
}

export function hasLunarOAuthProviderConfig(provider: LunarOAuthProvider) {
  const prefix = `LUNAR_${provider.toUpperCase()}`
  return Boolean(process.env[`${prefix}_CLIENT_ID`] && process.env[`${prefix}_CLIENT_SECRET`])
}

export function lunarOAuthConfig(provider: LunarOAuthProvider) {
  const prefix = `LUNAR_${provider.toUpperCase()}`
  const clientId = process.env[`${prefix}_CLIENT_ID`]
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function lunarCallbackUrl(request: Request, provider: LunarOAuthProvider) {
  const configuredBaseUrl = process.env.LUNAR_APP_URL
  const baseUrl = configuredBaseUrl ? new URL(configuredBaseUrl) : new URL(request.url)
  return new URL(`/api/auth/${provider}/callback`, baseUrl).toString()
}

export async function beginLunarOAuth(response: NextResponse, provider: LunarOAuthProvider, authorizeUrl: URL) {
  const state = randomState()
  const codeVerifier = provider === "discord" ? null : randomState()
  authorizeUrl.searchParams.set("state", state)
  if (codeVerifier) {
    authorizeUrl.searchParams.set("code_challenge", await pkceChallenge(codeVerifier))
    authorizeUrl.searchParams.set("code_challenge_method", "S256")
  }
  response.headers.set("Location", authorizeUrl.toString())
  response.cookies.set(stateCookieName(provider), JSON.stringify({ state, codeVerifier } satisfies LunarOAuthState), providerStateCookieOptions())
  return response
}

export async function validateLunarOAuthState(request: Request, provider: LunarOAuthProvider): Promise<LunarOAuthState | null> {
  const returnedState = new URL(request.url).searchParams.get("state")
  const rawState = (await cookies()).get(stateCookieName(provider))?.value
  if (!returnedState || !rawState) return null

  try {
    const stored = JSON.parse(rawState) as LunarOAuthState
    if (typeof stored.state !== "string" || (stored.codeVerifier !== null && typeof stored.codeVerifier !== "string")) return null
    return returnedState.length === stored.state.length && timingSafeEqual(returnedState, stored.state) ? stored : null
  } catch {
    return null
  }
}

function timingSafeEqual(left: string, right: string) {
  let mismatch = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return mismatch === 0
}

export function clearLunarOAuthState(response: NextResponse, provider: LunarOAuthProvider) {
  response.cookies.set(stateCookieName(provider), "", { ...providerStateCookieOptions(), maxAge: 0 })
}

export async function signLunarSession(user: LunarSessionUser, accountScope = user.sub) {
  const secret = authSecret()
  if (!secret || !isValidAccountScope(accountScope, user.sub)) throw new Error("Lunar authentication is not configured.")
  return new SignJWT({
    name: user.name,
    email: user.email,
    picture: user.picture,
    avatar_decoration: user.avatarDecoration,
    provider: user.provider,
    account_scope: accountScope,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secret)
}

export async function getLunarSessionFromToken(token: string | undefined): Promise<LunarSession | null> {
  const secret = authSecret()
  if (!secret || !token) return null

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    })
    const provider = typeof payload.provider === "string" && isLunarOAuthProvider(payload.provider) ? payload.provider : null
    if (!payload.sub || !provider || typeof payload.email !== "string" || !isValidAccountScope(payload.account_scope, payload.sub)) return null
    return {
      sub: payload.sub,
      name: typeof payload.name === "string" ? payload.name : null,
      email: payload.email,
      picture: typeof payload.picture === "string" ? payload.picture : null,
      avatarDecoration: typeof payload.avatar_decoration === "string" ? payload.avatar_decoration : null,
      provider,
      accountScope: payload.account_scope,
    }
  } catch {
    return null
  }
}

export async function getLunarSession(): Promise<LunarSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(LUNAR_SESSION_COOKIE)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE)?.value
  return getLunarSessionFromToken(token)
}

export async function attachLunarSession(response: NextResponse, user: LunarSessionUser, accountScope = user.sub) {
  response.cookies.set(LUNAR_SESSION_COOKIE, await signLunarSession(user, accountScope), sessionCookieOptions(SESSION_DURATION_SECONDS))
}

export function clearLunarSession(response: NextResponse) {
  response.cookies.set(LUNAR_SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 })
  response.cookies.set(LEGACY_SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 })
}

export function lunarAuthFailure(request: Request, code: "cancelled" | "unavailable" | "failed" | "unverified") {
  return NextResponse.redirect(new URL(`/login?auth=${code}`, request.url))
}

export function lunarAuthSuccess(request: Request, user: LunarSessionUser, accountScope = user.sub) {
  const response = NextResponse.redirect(new URL("/", request.url))
  response.headers.set("Cache-Control", "private, no-store, max-age=0")
  response.headers.set("Pragma", "no-cache")
  return attachLunarSession(response, user, accountScope).then(() => response)
}
