import { Auth0Client } from "@auth0/nextjs-auth0/server"

export const auth0 = new Auth0Client({
  signInReturnToPath: "/",
})

export const AUTH0_CONNECTIONS = {
  google: "google-oauth2",
  github: "github",
  apple: "apple",
} as const

export type Auth0Connection = keyof typeof AUTH0_CONNECTIONS
