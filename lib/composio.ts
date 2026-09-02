import { Composio } from "@composio/core";
import { composioToolkitSlug, connectorKeysMatch, normalizeConnectorKeyForRouting } from "@/lib/connector-action-safety";

export type LiveComposioAccount = {
  id: string;
  toolkit: string;
  normalizedToolkit: string;
  status: string;
  enabled: boolean;
  connected: boolean;
  alias?: string | null;
  statusReason?: string | null;
  updatedAt?: string | null;
};

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

function isActiveConnectedAccount(account: Pick<LiveComposioAccount, 'status' | 'enabled'>) {
  return account.enabled && ["active", "connected", "success"].includes(account.status);
}

function uniqueToolkitSlugs(toolkits: string[]) {
  return [...new Set(
    toolkits
      .map((toolkit) => composioToolkitSlug(toolkit))
      .filter((toolkit) => /^[a-z0-9][a-z0-9_-]{1,79}$/.test(toolkit))
  )];
}

function normalizeAccount(account: any): LiveComposioAccount | null {
  const toolkit = composioToolkitSlug(account?.toolkit?.slug);
  const id = String(account?.id || "").trim();
  if (!toolkit || !id) return null;
  const status = String(account?.status || "").trim().toLowerCase();
  const enabled = !Boolean(account?.isDisabled);
  return {
    id,
    toolkit,
    normalizedToolkit: normalizeConnectorKeyForRouting(toolkit),
    status,
    enabled,
    connected: isActiveConnectedAccount({ status, enabled }),
    alias: account?.alias || null,
    statusReason: account?.statusReason || null,
    updatedAt: account?.updatedAt || null,
  };
}

/**
 * Loads every account belonging to one authenticated user. This is the server-side
 * source of truth; browser storage is only a transient transport cache for the UI.
 */
export async function getLiveComposioAccounts(userId: string): Promise<LiveComposioAccount[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !userId) return [];

  const composio = new Composio({ apiKey });
  const response: any = await composio.connectedAccounts.list({
    userIds: getComposioUserIds(userId),
    limit: 1000,
  });
  return (response?.items || []).map(normalizeAccount).filter(Boolean) as LiveComposioAccount[];
}

export function findEnabledComposioAccount(accounts: LiveComposioAccount[], requestedToolkit: unknown) {
  return accounts.find((account) => account.connected && connectorKeysMatch(account.toolkit, requestedToolkit)) || null;
}

/**
 * Reads the user’s live, enabled Composio accounts. This is the source of truth
 * for chat; browser localStorage is treated only as a UI cache.
 */
export async function getEnabledComposioToolkits(userId: string): Promise<string[]> {
  const accounts = await getLiveComposioAccounts(userId);
  return uniqueToolkitSlugs(accounts.filter((account) => account.connected).map((account) => account.toolkit));
}

/**
 * Creates a user-scoped native Tool Router session. The app uses this session
 * for authorize(), search(), and execute(), which is the supported path for a
 * custom connection UI and avoids preloading every tool schema into chat.
 */
export async function getComposioSession(userId: string, toolkits: string[] = []) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !userId) return null;

  const scopedToolkits = uniqueToolkitSlugs(toolkits);
  const composio = new Composio({ apiKey });

  return composio.sessions.create(getComposioUserId(userId), {
    manageConnections: false,
    sandbox: { enable: false },
    ...(scopedToolkits.length > 0 ? { toolkits: scopedToolkits } : {}),
  });
}

export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}
