import { getSession } from "@/lib/auth";
import { getLiveComposioAccounts } from "@/lib/composio";

export async function GET() {
  const session = await getSession();
  const userId = session?.user?.sub;
  const configured = Boolean(process.env.COMPOSIO_API_KEY);

  if (!userId || !configured) {
    return Response.json({ configured, accounts: [] });
  }

  try {
    const accounts = await getLiveComposioAccounts(userId);
    return Response.json({
      configured: true,
      accounts: accounts.map((account) => ({
        id: account.id,
        toolkit: account.toolkit,
        status: account.status,
        statusReason: account.statusReason || null,
        enabled: account.enabled,
        connected: account.connected,
        alias: account.alias || null,
        updatedAt: account.updatedAt || null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Composio account status error:", error);
    return Response.json({ configured: true, accounts: [], error: "Unable to load connector status." }, { status: 502 });
  }
}
