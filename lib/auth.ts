import { getLunarSession } from "@/lib/lunar-auth"

export type AppSessionUser = {
  sub: string
  name: string | null
  email: string | null
  picture: string | null
}

export type AppSession = {
  user: AppSessionUser
}

/**
 * Returns Lunar's signed first-party session in the stable account shape used by
 * chats, profiles, attachments, analytics, and connector state. The scope is
 * resolved and signed during the provider callback, so all existing user-owned
 * routes keep their original account-isolation key without extra network calls.
 */
export async function getSession(): Promise<AppSession | null> {
  const session = await getLunarSession()
  if (!session) return null

  return {
    user: {
      sub: session.accountScope,
      name: session.name,
      email: session.email,
      picture: session.picture,
    },
  }
}

export const AUTH_CONNECTIONS = {
  google: "google",
  github: "github",
  discord: "discord",
} as const

export type AuthConnection = keyof typeof AUTH_CONNECTIONS
