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
  const response = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      "x-agent-gateway-secret": secret,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(120000),
  })

  const text = await response.text()
  let data: AgentGatewayResponse
  try {
    data = JSON.parse(text)
  } catch {
    data = { content: text }
  }
  if (!response.ok) {
    throw new Error(data.error || data.message || `Agent Computer request failed (${response.status})`)
  }
  return data
}

export function gatewayResultText(data: AgentGatewayResponse) {
  if (typeof data.content === "string") return data.content
  if (typeof data.output === "string") return data.output
  if (typeof data.message === "string") return data.message
  if (typeof data.result === "string") return data.result
  if (data.result !== undefined) return JSON.stringify(data.result, null, 2)
  return JSON.stringify(data, null, 2)
}
