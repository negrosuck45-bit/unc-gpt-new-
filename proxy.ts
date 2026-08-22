import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { clerkMiddleware } from "@clerk/nextjs/server"

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const url = new URL(request.url)
  if (url.pathname === "/auth/callback" && url.searchParams.has("error")) {
    const reason = url.searchParams.get("error_description") || url.searchParams.get("error") || "authorization_failed"
    return NextResponse.redirect(new URL(`/auth/error?reason=${encodeURIComponent(reason)}`, url.origin))
  }
  return clerkMiddleware()(request, event)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
}
