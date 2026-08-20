import { auth0 } from "@/lib/auth0";
import { Composio } from "@composio/core";
import { getComposioUserIds } from "@/lib/composio";

export async function GET() {
  const session = await auth0.getSession();
  const userId = session?.user?.sub;
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!userId || !apiKey) {
    return Response.json({ configured: Boolean(apiKey), accounts: [] });
  }

  try {
    const composio = new Composio({ apiKey });
    const response: any = await composio.connectedAccounts.list({ userIds: getComposioUserIds(userId), limit: 1000 });
    const accounts = (response?.items || []).map((account: any) => ({
      id: account.id,
      toolkit: account.toolkit?.slug || "",
      status: String(account.status || "").toLowerCase(),
      statusReason: account.statusReason || null,
      enabled: !Boolean(account.isDisabled),
      alias: account.alias || null,
      updatedAt: account.updatedAt || null,
    })).filter((account: any) => account.toolkit);

    return Response.json({ configured: true, accounts });
  } catch (error) {
    console.error("Composio account status error:", error);
    return Response.json({ configured: true, accounts: [], error: "Unable to load connector status." }, { status: 502 });
  }
}
