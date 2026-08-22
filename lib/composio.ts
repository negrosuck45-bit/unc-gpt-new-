import { Composio } from "@composio/core";

export interface ComposioConnector {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  type: "http";
  enabled: boolean;
}

/**
 * Creates a short-lived per-user hosted MCP session when COMPOSIO_API_KEY is configured.
 * The API key stays server-side; only the session URL and headers are used internally by
 * the chat route to discover and execute tools.
 */
export function getComposioUserId(authenticatedUserId: string) {
  // Never use a deployment-wide fallback: it would mix connector accounts
  // between Clerk users. Composio must receive a stable per-user identifier.
  return authenticatedUserId;
}

export function getComposioUserIds(authenticatedUserId: string) {
  return [...new Set([getComposioUserId(authenticatedUserId), authenticatedUserId].filter(Boolean))];
}

export async function getComposioSession(userId: string) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !userId) return null;

  const composio = new Composio({ apiKey });
  return composio.sessions.create(getComposioUserId(userId), {
    mcp: true,
    manageConnections: true,
  });
}

export async function getComposioConnector(userId: string): Promise<ComposioConnector | null> {
  const session = await getComposioSession(userId);
  if (!session) return null;

  return {
    id: `composio_${userId}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48),
    name: "Composio",
    url: session.mcp.url,
    headers: session.mcp.headers || {},
    type: "http",
    enabled: true,
  };
}

export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}
