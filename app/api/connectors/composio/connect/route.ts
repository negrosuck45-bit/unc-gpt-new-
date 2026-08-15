import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getComposioSession } from "@/lib/composio";

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  const userId = session?.user?.sub;
  if (!userId) return Response.json({ error: "Sign in before connecting an app." }, { status: 401 });

  let toolkit = "";
  try {
    toolkit = String((await req.json()).toolkit || "").trim().toLowerCase();
  } catch {
    return Response.json({ error: "Choose an app to connect." }, { status: 400 });
  }

  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(toolkit) || toolkit.startsWith("composio")) {
    return Response.json({ error: "Choose a valid Composio app from the catalog." }, { status: 400 });
  }

  try {
    const composio = await getComposioSession(userId);
    if (!composio) return Response.json({ error: "Composio is not configured on this deployment." }, { status: 503 });

    const result: any = await composio.execute("COMPOSIO_MANAGE_CONNECTIONS", {
      toolkits: [toolkit],
    });
    const connection = result?.data?.results?.[toolkit] || result?.results?.[toolkit];
    const redirectUrl = connection?.redirect_url;
    if (!redirectUrl) {
      return Response.json({ error: connection?.instruction || "Composio did not return a connection link." }, { status: 502 });
    }

    return Response.json({ toolkit, redirectUrl, expiresInMinutes: 10 });
  } catch (error: any) {
    console.error("Composio connection link error:", error);
    return Response.json({ error: error?.message || "Unable to start the app connection." }, { status: 502 });
  }
}
