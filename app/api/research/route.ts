import { NextRequest } from "next/server";
import {
  searchWeb,
  formatSearchResultsForAI,
  generateCitations,
} from "@/lib/web-search-enhanced";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { query, depth = "quick", includeContent = false } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return Response.json(
        { error: "Invalid query: must be a non-empty string" },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();

    // Perform web search with real-time data
    const searchResults = await searchWeb(trimmedQuery, {
      fetchContent: depth === "deep" || includeContent,
      useCache: depth !== "live", // Don't cache for "live" requests
    });

    // Format results for AI response
    const formattedResults = formatSearchResultsForAI(searchResults);
    const citations = generateCitations(searchResults);

    // Prepare response with all metadata
    const response = {
      success: true,
      query: trimmedQuery,
      searchDate: searchResults.searchedAt,
      searchSources: searchResults.sources,
      resultCount: searchResults.results.length,
      results: searchResults.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        source: r.source,
        domain: r.domain,
        retrievedDate: searchResults.searchedAt,
        citationKey: `[${r.domain}]`,
      })),
      formattedForAI: formattedResults,
      citations,
      instructions: {
        citation_format:
          "When referencing these results, use the format: [1] Source Name: Key claim. URL: [source_url]. Retrieved: [date]",
        must_include_date: true,
        must_include_url: true,
        must_include_source: true,
      },
    };

    return Response.json(response, {
      headers: {
        "Cache-Control":
          depth === "live" ? "no-cache, no-store" : "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Research endpoint error:", error);
    return Response.json(
      {
        success: false,
        error: error.message || "Search failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");

  if (!query) {
    return Response.json({
      features: [
        "✅ Real-time web search (live results)",
        "✅ Free APIs (no paid keys needed)",
        "✅ Multiple sources (Searxng, DuckDuckGo, Brave)",
        "✅ Source attribution with dates",
        "✅ Automatic citation formatting",
        "✅ Content extraction from top results",
        "✅ Caching for performance",
        "✅ Error handling and fallbacks",
      ],
      endpoints: {
        POST: {
          description: "Execute web search",
          params: {
            query: "string (required) - Search query",
            depth: "string (optional) - 'quick' (default), 'deep', or 'live'",
            includeContent:
              "boolean (optional) - Extract full content from results",
          },
          example: {
            query: "latest AI developments 2026",
            depth: "deep",
            includeContent: true,
          },
        },
        GET: {
          description: "Get search by query parameter",
          params: {
            q: "string - Search query",
          },
          example: "?q=latest+news+2026",
        },
      },
      version: "2.0 (Enhanced)",
      lastUpdated: "2026-05-18",
    });
  }

  // Handle GET search
  const searchResults = await searchWeb(query, { fetchContent: false });

  return Response.json({
    success: true,
    query,
    results: searchResults.results,
    sources: searchResults.sources,
    timestamp: searchResults.searchedAt,
  });
}