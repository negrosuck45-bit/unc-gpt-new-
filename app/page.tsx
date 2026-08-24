import { AuthPanel } from "@/components/auth-panel"
import { getSession } from "@/lib/auth"
import ChatWorkspace from "./chat-workspace"

export default async function Home() {
  const session = await getSession()

  if (!session && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthPanel />
  }

  return <ChatWorkspace accountScope={session?.user.sub ?? "guest"} />
}
