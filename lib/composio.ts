import { Composio } from "@composio/core";

/**
 * Composio user IDs must remain stable and scoped to the authenticated Clerk user.
 * A deployment-wide fallback would mix connected accounts between users.
 */
export function getComposioUserId(authenticatedUserId: string) {
  return authenticatedUserId;
}

export function getComposioUserIds(authenticatedUserId: string) {
  return [...new Set([getComposioUserId(authenticatedUserId), authenticatedUserId].filter(Boolean))];
}

function isActiveConnectedAccount(account: any) {
  const status = String(account?.status || "").toLowerCase();
  return !account?.isDisabled && ["active", "connected", "success"].includes(status);
}

function uniqueToolkitSlugs(toolkits: string[]) {
  return [...new Set(
    toolkits
      .map((toolkit) => String(toolkit || "").trim().toLowerCase())
      .filter((toolkit) => /^[a-z0-9][a-z0-9_-]{1,79}$/.test(toolkit))
  )];
}

/**
 * Reads the user’s live, enabled Composio accounts. Chat uses this server-side
 * source of truth instead of relying on possibly stale browser localStorage.
 */
export async function getEnabledComposioToolkits(userId: string): Promise<string[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !userId) return [];

  const composio = new Composio({ apiKey });
  const response: any = await composio.connectedAccounts.list({
    userIds: getComposioUserIds(userId),
    limit: 1000,
  });

  return uniqueToolkitSlugs(
    (response?.items || [])
      .filter(isActiveConnectedAccount)
      .map((account: any) => account?.toolkit?.slug)
  );
}

/**
 * Creates a short-lived, user-scoped Tool Router session. Whenever a toolkit
 * is requested we pass a positive toolkit allowlist and preload its tools.
 * This is required by current Composio validation and makes the selected app’s
 * tool schemas directly available to the model.
 */
export async function getComposioSession(userId: string, toolkits: string[] = []) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !userId) return null;

  const scopedToolkits = uniqueToolkitSlugs(toolkits);
  const composio = new Composio({ apiKey });

  return composio.sessions.create(getComposioUserId(userId), {
    mcp: true,
    manageConnections: true,
    sandbox: { enable: false },
    ...(scopedToolkits.length > 0
      ? {
          toolkits: scopedToolkits,
          preload: { tools: "all" as const },
        }
      : {}),
  });
}

export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}
