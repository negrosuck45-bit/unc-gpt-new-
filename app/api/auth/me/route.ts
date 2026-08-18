import { NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"

export async function GET() {
  const session = await auth0.getSession()
  if (!session?.user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      picture: session.user.picture ?? null,
      sub: session.user.sub ?? null,
    },
  })
}
