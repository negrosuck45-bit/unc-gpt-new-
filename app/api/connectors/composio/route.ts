import { auth0 } from "@/lib/auth0";
import { isComposioConfigured } from "@/lib/composio";

export async function GET() {
  const session = await auth0.getSession();
  return Response.json({
    authenticated: Boolean(session?.user?.sub),
    configured: isComposioConfigured(),
    label: "Composio",
    description: "Connect Gmail, Slack, GitHub, Notion, Drive, and other toolkits through one managed MCP session.",
    setupUrl: "https://docs.composio.dev/docs",
  });
}
