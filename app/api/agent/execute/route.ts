import { NextRequest } from "next/server"
import { getSession } from "@/lib/auth"
import { checkAgentGateway, executeAgentGateway } from "@/lib/agent-gateway"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSession()
  if (!session?.user?.sub) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  try {
    const health = await checkAgentGateway()
    return Response.json({ ok: true, health })
  } catch (error: any) {
    return Response.json({ ok: false, error: error?.message || "Agent Computer offline" }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.sub) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.task !== "string" || !body.task.trim()) {
    return Response.json({ error: "A task is required" }, { status: 400 })
  }

  try {
    const result = await executeAgentGateway({
      task: body.task.trim(),
      messages: Array.isArray(body.messages) ? body.messages : undefined,
      preferredModel: body.preferredModel,
      preferredProvider: body.preferredProvider,
      tool: body.tool,
      args: body.args,
    })
    return Response.json({ ok: true, ...result })
  } catch (error: any) {
    return Response.json({ ok: false, error: error?.message || "Agent Computer request failed" }, { status: 502 })
  }
}
