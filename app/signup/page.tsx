import { redirect } from "next/navigation"
import { AuthPanel } from "@/components/auth-panel"
import { getSession } from "@/lib/auth"

export default async function SignupPage() {
  const session = await getSession()
  if (session) redirect("/")
  return <AuthPanel />
}
