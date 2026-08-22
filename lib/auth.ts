import { auth, currentUser } from "@clerk/nextjs/server"

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
 * Returns the current Clerk identity in the session shape used by the app.
 * Clerk's userId is the account-isolation key for profiles, chats, and social data.
 */
export async function getSession(): Promise<AppSession | null> {
  const { userId } = await auth()
  if (!userId) return null

  const user = await currentUser()
  return {
    user: {
      sub: userId,
      name: user?.fullName ?? user?.username ?? null,
      email: user?.primaryEmailAddress?.emailAddress ?? null,
      picture: user?.imageUrl ?? null,
    },
  }
}

export const AUTH_CONNECTIONS = {
  google: "google",
  github: "github",
  apple: "apple",
  discord: "discord",
} as const

export type AuthConnection = keyof typeof AUTH_CONNECTIONS
