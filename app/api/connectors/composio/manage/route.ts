import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";
import { Composio } from "@composio/core";
import { getComposioUserIds } from "@/lib/composio";

async function getAccount(composio: Composio, userId: string, accountId?: string, toolkit?: string) {
  if (accountId) return composio.connectedAccounts.get(accountId);
  const response: any = await composio.connectedAccounts.list({ userIds: getComposioUserIds(userId), toolkitSlugs: toolkit ? [toolkit] : undefined, limit: 1000 });
  return response?.items?.[0] || null;
}

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  const userId = session?.user?.sub;
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!userId) return Response.json({ error: "Sign in before managing connectors." }, { status: 401 });
  if (!apiKey) return Response.json({ error: "Composio is not configured on this deployment." }, { status: 503 });

  let body: { action?: string; accountId?: string; toolkit?: string; enabled?: boolean };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid connector request." }, { status: 400 }); }

  const action = String(body.action || "").toLowerCase();
  if (!["enable", "disable", "disconnect"].includes(action)) {
    return Response.json({ error: "Unsupported connector action." }, { status: 400 });
  }

  try {
    const composio = new Composio({ apiKey });
    const account: any = await getAccount(composio, userId, body.accountId, body.toolkit);
    if (!account?.id) return Response.json({ error: "Connector account not found." }, { status: 404 });

    if (action === "disconnect") {
      await composio.connectedAccounts.delete(account.id);
      return Response.json({ ok: true, action, accountId: account.id, toolkit: account.toolkit?.slug || body.toolkit });
    }

    await composio.connectedAccounts.updateStatus(account.id, { enabled: action === "enable" });
    return Response.json({ ok: true, action, accountId: account.id, toolkit: account.toolkit?.slug || body.toolkit, enabled: action === "enable" });
  } catch (error: any) {
    console.error("Composio account management error:", error);
    return Response.json({ error: error?.message || "Unable to update connector." }, { status: 502 });
  }
}
