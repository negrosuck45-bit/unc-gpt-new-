import { AuthPanel } from "@/components/auth-panel"
import { getSession } from "@/lib/auth"
import ChatWorkspace from "./chat-workspace"

// Authentication is cookie-backed; never allow a logged-out shell or onboarding
// response to be reused for a returning authenticated user.
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function Home() {
  const session = await getSession()

  if (!session) {
    return <AuthPanel />
  }

  return <ChatWorkspace accountScope={session.user.sub} />
}
