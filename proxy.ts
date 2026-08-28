import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { getLunarSessionFromToken, LUNAR_SESSION_COOKIE } from "@/lib/lunar-auth"

const PUBLIC_API_PATHS = new Set(["/api/profile/view", "/api/profile/avatar"])
const MCP_OAUTH_CALLBACK_PATH = /^\/api\/mcp\/oauth\/[^/]+\/callback$/
const LUNAR_OAUTH_PATH = /^\/api\/auth\/(google|discord|github)\/(start|callback)$/
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  // State-changing API calls from browsers include Origin. If it is absent,
  // accept only requests explicitly identified as same-origin by Fetch Metadata.
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin"
  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest, _event: NextFetchEvent) {
  const { pathname } = request.nextUrl
  const isApiRequest = pathname.startsWith("/api/")
  const isMcpOAuthCallback = MCP_OAUTH_CALLBACK_PATH.test(pathname)
  const isLunarOAuthRoute = LUNAR_OAUTH_PATH.test(pathname)

  if (isApiRequest && STATE_CHANGING_METHODS.has(request.method) && !isMcpOAuthCallback && !isLunarOAuthRoute && !hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 })
  }

  if (isApiRequest && !isMcpOAuthCallback && !isLunarOAuthRoute && !PUBLIC_API_PATHS.has(pathname)) {
    const token = request.cookies.get(LUNAR_SESSION_COOKIE)?.value
    const session = await getLunarSessionFromToken(token)
    if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
}
