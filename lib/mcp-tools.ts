export type MCPTool = {
  name: string
  description: string
  server: string
}

/**
 * The active chat path uses the connector-aware gateway. These helpers keep the
 * legacy v2 components type-safe without claiming a generic MCP endpoint exists.
 */
export async function listMCPTools(): Promise<MCPTool[]> {
  return []
}

export async function executeMCPTool(_server: string, _tool: string, _input: Record<string, unknown>): Promise<string> {
  throw new Error("MCP tool execution is available through the active connector chat path")
}
