import { redirect } from "next/navigation"
import { AuthPanel } from "@/components/auth-panel"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect("/")
  return <AuthPanel />
}
