import { redirect } from "next/navigation"
import { AuthPanel } from "@/components/auth-panel"
import { auth0 } from "@/lib/auth0"

export default async function LoginPage() {
  const session = await auth0.getSession()
  if (session) redirect("/")
  return <AuthPanel />
}
