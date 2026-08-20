export type AgentGatewayRequest = {
  task?: string
  tool?: string
  args?: Record<string, unknown>
  messages?: unknown[]
  preferredModel?: string
  preferredProvider?: string
  [key: string]: unknown
}

export type AgentGatewayResponse = {
  ok?: boolean
  content?: string
  result?: unknown
  output?: string
  message?: string
  error?: string
  steps?: unknown[]
  [key: string]: unknown
}

function gatewayConfig() {
  const baseUrl = process.env.AGENT_GATEWAY_URL?.replace(/\/$/, "")
  const secret = process.env.AGENT_GATEWAY_SECRET
  if (!baseUrl || !secret) {
    throw new Error("Agent Computer is not configured on the server")
  }
  return { baseUrl, secret }
}

export async function checkAgentGateway() {
  const { baseUrl } = gatewayConfig()
  // /health is deliberately public on the gateway. Avoid sending sensitive
  // authorization headers because the temporary relay rejects those requests.
  const response = await fetch(`${baseUrl}/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Agent Computer health check failed (${response.status})`)
  return data
}

export async function executeAgentGateway(payload: AgentGatewayRequest): Promise<AgentGatewayResponse> {
  const { baseUrl, secret } = gatewayConfig()
  const response = await fetch(`${baseUrl}/v1/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-uncgpt-agent-secret": secret,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(120000),
  })

  const text = await response.text()
  if (!response.ok) {
    let errorData: AgentGatewayResponse = {}
    try { errorData = JSON.parse(text) } catch {}
    throw new Error(errorData.error || errorData.message || `Agent Computer request failed (${response.status})`)
  }

  const content: string[] = []
  const steps: unknown[] = []
  for (const event of text.split(/\n\n+/)) {
    const line = event.split("\n").find((entry) => entry.startsWith("data: "))
    if (!line) continue
    const value = line.slice(6).trim()
    if (!value || value === "[DONE]") continue
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed.content === "string") content.push(parsed.content)
      if (parsed.tool_step) steps.push(parsed.tool_step)
      if (parsed.result && typeof parsed.result === "string") content.push(parsed.result)
    } catch {}
  }
  return { content: content.join("\n"), steps }
}

export function gatewayResultText(data: AgentGatewayResponse) {
  if (typeof data.content === "string") return data.content
  if (typeof data.output === "string") return data.output
  if (typeof data.message === "string") return data.message
  if (typeof data.result === "string") return data.result
  if (data.result !== undefined) return JSON.stringify(data.result, null, 2)
  return JSON.stringify(data, null, 2)
}
