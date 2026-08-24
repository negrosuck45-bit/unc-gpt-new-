export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { AuthPanel } from "@/components/auth-panel"
import { getSession } from "@/lib/auth"

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect("/")
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground"><p>Authentication is not configured in this preview.</p></main>
  }
  return <AuthPanel />
}
