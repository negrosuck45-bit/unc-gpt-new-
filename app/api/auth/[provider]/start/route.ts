import { NextResponse } from "next/server"
import {
  beginLunarOAuth,
  isLunarOAuthProvider,
  lunarAuthFailure,
  lunarCallbackUrl,
  lunarOAuthConfig,
  type LunarOAuthProvider,
} from "@/lib/lunar-auth"

export const runtime = "nodejs"

function authorizationUrl(request: Request, provider: LunarOAuthProvider, clientId: string) {
  const callbackUrl = lunarCallbackUrl(request, provider)

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", callbackUrl)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", "openid email profile")
    url.searchParams.set("prompt", "select_account")
    return url
  }

  if (provider === "discord") {
    const url = new URL("https://discord.com/api/oauth2/authorize")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", callbackUrl)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", "identify email")
    return url
  }

  const url = new URL("https://github.com/login/oauth/authorize")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", callbackUrl)
  url.searchParams.set("scope", "read:user user:email")
  return url
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: requestedProvider } = await context.params
  if (!isLunarOAuthProvider(requestedProvider)) return NextResponse.json({ error: "Not found." }, { status: 404 })

  const config = lunarOAuthConfig(requestedProvider)
  if (!config) return lunarAuthFailure(request, "unavailable")

  const url = authorizationUrl(request, requestedProvider, config.clientId)
  const response = NextResponse.redirect(url, 302)
  return beginLunarOAuth(response, requestedProvider, url)
}
