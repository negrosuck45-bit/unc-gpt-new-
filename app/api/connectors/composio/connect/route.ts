import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getComposioSession } from "@/lib/composio";
import { composioToolkitSlug } from "@/lib/connector-action-safety";

function appCallbackUrl(req: NextRequest) {
  const protocol = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host");
  if (!host) return undefined;
  return `${protocol}://${host}/?connector=connected`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.sub;
  if (!userId) return Response.json({ error: "Sign in before connecting an app." }, { status: 401 });

  let toolkit = "";
  try {
    toolkit = composioToolkitSlug((await req.json()).toolkit);
  } catch {
    return Response.json({ error: "Choose an app to connect." }, { status: 400 });
  }

  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(toolkit) || toolkit.startsWith("composio")) {
    return Response.json({ error: "Choose a valid Composio app from the catalog." }, { status: 400 });
  }

  try {
    const composio = await getComposioSession(userId, [toolkit]);
    if (!composio) return Response.json({ error: "Composio is not configured on this deployment." }, { status: 503 });

    const connectionRequest = await composio.authorize(toolkit, {
      callbackUrl: appCallbackUrl(req),
    });
    if (!connectionRequest?.redirectUrl) {
      return Response.json({ error: "Composio did not return a connection link. Please try again." }, { status: 502 });
    }

    return Response.json({ toolkit, redirectUrl: connectionRequest.redirectUrl, expiresInMinutes: 10 });
  } catch (error: any) {
    console.error("Composio connection link error:", {
      toolkit,
      message: error?.message || "Unable to start the app connection.",
    });
    return Response.json({ error: error?.message || "Unable to start the app connection." }, { status: 502 });
  }
}
