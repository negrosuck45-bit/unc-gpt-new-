import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { clerkMiddleware } from "@clerk/nextjs/server"

const PUBLIC_API_PATHS = new Set(["/api/profile/view", "/api/profile/avatar"])
const OAUTH_CALLBACK_PATH = /^\/api\/mcp\/oauth\/[^/]+\/callback$/
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site"
  try {
    return new URL(origin).host === request.nextUrl.host
  } catch {
    return false
  }
}

const secureRequestBoundary = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl
  const isApiRequest = pathname.startsWith("/api/")
  const isOAuthCallback = OAUTH_CALLBACK_PATH.test(pathname)

  if (isApiRequest && STATE_CHANGING_METHODS.has(request.method) && !isOAuthCallback && !hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 })
  }

  if (isApiRequest && !isOAuthCallback && !PUBLIC_API_PATHS.has(pathname)) {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  }

  return NextResponse.next()
})

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const url = new URL(request.url)
  if (url.pathname === "/auth/callback" && url.searchParams.has("error")) {
    const reason = url.searchParams.get("error_description") || url.searchParams.get("error") || "authorization_failed"
    return NextResponse.redirect(new URL(`/auth/error?reason=${encodeURIComponent(reason)}`, url.origin))
  }
  return secureRequestBoundary(request, event)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
}
