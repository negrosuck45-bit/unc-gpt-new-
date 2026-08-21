import { NextResponse } from "next/server"
import { auth0 } from "./lib/auth0"

export async function proxy(request: Request) {
  const url = new URL(request.url)
  if (url.pathname === "/auth/callback" && url.searchParams.has("error")) {
    const reason = url.searchParams.get("error_description") || url.searchParams.get("error") || "authorization_failed"
    return NextResponse.redirect(new URL(`/auth/error?reason=${encodeURIComponent(reason)}`, url.origin))
  }
  return await auth0.middleware(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
}
