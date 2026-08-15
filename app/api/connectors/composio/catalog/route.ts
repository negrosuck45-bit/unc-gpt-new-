import { NextRequest } from "next/server";
import { Composio } from "@composio/core";
import { isComposioConfigured } from "@/lib/composio";

export async function GET(req: NextRequest) {
  if (!isComposioConfigured()) {
    return Response.json({ configured: false, items: [] });
  }

  const query = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  try {
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const response: any = await composio.toolkits.getToolkits({});
    const raw = Array.isArray(response) ? response : response?.items || response?.data || [];
    const items = raw
      .map((toolkit: any) => ({
        slug: String(toolkit.slug || toolkit.key || toolkit.name || "").toLowerCase(),
        name: toolkit.name || toolkit.displayName || toolkit.slug,
        description: toolkit.description || toolkit.shortDescription || toolkit.meta?.description || "Connect this app through Composio.",
        logo: toolkit.logo || toolkit.logoUrl || toolkit.meta?.logo || toolkit.meta?.logoUrl || null,
        categories: toolkit.categories || toolkit.meta?.categories || [],
      }))
      .filter((toolkit: any) => toolkit.slug)
      .filter((toolkit: any) => !query || `${toolkit.slug} ${toolkit.name} ${toolkit.description}`.toLowerCase().includes(query))
      ;

    return Response.json({ configured: true, items });
  } catch (error: any) {
    console.error("Composio toolkit catalog error:", error);
    return Response.json({ configured: true, items: [], error: "Unable to load the Composio app catalog." }, { status: 502 });
  }
}
