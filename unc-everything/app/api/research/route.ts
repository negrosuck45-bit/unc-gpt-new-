import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { query, depth = "quick" } = await req.json();

    if (!query) {
      return Response.json({ error: "Missing query" }, { status: 400 });
    }

    // Search using SerpAPI or DuckDuckGo
    const results = await searchWeb(query);
    
    let analysis = "";
    if (depth === "deep") {
      // Fetch content from top results
      analysis = await analyzeResults(results);
    }

    return Response.json({
      success: true,
      query,
      results,
      analysis: depth === "deep" ? analysis : undefined,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function searchWeb(query: string): Promise<any[]> {
  try {
    // Using free DuckDuckGo search
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
    const response = await fetch(url);
    const data = await response.json();

    return (data.Results || []).slice(0, 5).map((result: any) => ({
      title: result.Title,
      url: result.FirstURL,
      snippet: result.Text,
    }));
  } catch (error) {
    return [];
  }
}

async function analyzeResults(results: any[]): Promise<string> {
  // Would use Groq LLM to analyze search results
  return results.map((r) => `${r.title}: ${r.snippet}`).join("\n\n");
}

export async function GET() {
  return Response.json({
    features: [
      "Web search with DuckDuckGo",
      "Deep research mode",
      "Content analysis",
      "Multi-source aggregation",
    ],
  });
}
