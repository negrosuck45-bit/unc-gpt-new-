import { AuthPanel } from "@/components/auth-panel"
import { auth0 } from "@/lib/auth0"
import ChatWorkspace from "./chat-workspace"

export default async function Home() {
  const session = await auth0.getSession()

  if (!session) {
    return <AuthPanel />
  }

  return <ChatWorkspace accountScope={session.user.sub} />
}
