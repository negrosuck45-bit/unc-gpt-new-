/**
 * Enhanced Web Search Module
 * - Free APIs (no paid keys needed)
 * - Real-time search results
 * - Automatic source attribution
 * - Fallback mechanisms
 * - Caching for performance
 */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date?: string;
  domain: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchedAt: string;
  sources: string[];
}

const SEARCH_CACHE = new Map<string, { data: SearchResponse; timestamp: number }>();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Primary search using Searxng (meta-search, free, no auth needed)
 * Aggregates multiple search engines in real-time
 */
async function searchSearxng(query: string): Promise<SearchResult[]> {
  try {
    // Using public Searxng instance
    const url = new URL("https://search.nixnet.services/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("safesearch", "0");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 8000,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: any = await response.json();
    return (data.results || [])
      .slice(0, 8)
      .map((result: any) => ({
        title: result.title,
        url: result.url,
        snippet: result.content,
        source: "Searxng (Meta-search)",
        domain: new URL(result.url).hostname,
        date: result.publishedDate || undefined,
      }));
  } catch (error) {
    console.error("Searxng search failed:", error);
    return [];
  }
}

/**
 * Fallback 1: DuckDuckGo search (very reliable free service)
 */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 8000,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: any = await response.json();

    const results: SearchResult[] = [];

    // Process AbstractResults (featured snippet)
    if (data.AbstractText) {
      results.push({
        title: data.AbstractTitle || "Featured Result",
        url: data.AbstractURL || "",
        snippet: data.AbstractText,
        source: "DuckDuckGo",
        domain: data.AbstractURL
          ? new URL(data.AbstractURL).hostname
          : "duckduckgo.com",
      });
    }

    // Process regular results
    (data.Results || []).slice(0, 7).forEach((result: any) => {
      results.push({
        title: result.Title,
        url: result.FirstURL,
        snippet: result.Text,
        source: "DuckDuckGo",
        domain: new URL(result.FirstURL).hostname,
      });
    });

    return results;
  } catch (error) {
    console.error("DuckDuckGo search failed:", error);
    return [];
  }
}

/**
 * Fallback 2: Brave Search (free tier, real-time results)
 */
async function searchBrave(query: string): Promise<SearchResult[]> {
  try {
    // Brave offers a free API tier
    const response = await fetch("https://api.search.brave.com/res/v1/web/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        q: query,
        count: 8,
      }),
      timeout: 8000,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: any = await response.json();

    return (data.web || []).map((result: any) => ({
      title: result.title,
      url: result.url,
      snippet: result.description || result.snippet,
      source: "Brave Search",
      domain: new URL(result.url).hostname,
      date: result.age ? new Date(result.age).toISOString() : undefined,
    }));
  } catch (error) {
    console.error("Brave search failed:", error);
    return [];
  }
}

/**
 * Fallback 3: Jina Reader (extract live content from top results)
 */
async function extractReaderContent(url: string): Promise<string> {
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "application/json",
      },
      timeout: 5000,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: any = await response.json();
    return data.content || data.data || "";
  } catch (error) {
    console.error("Content extraction failed:", error);
    return "";
  }
}

/**
 * Main search function with intelligent fallback chain
 */
export async function searchWeb(
  query: string,
  options: { fetchContent?: boolean; useCache?: boolean } = {}
): Promise<SearchResponse> {
  const { fetchContent = false, useCache = true } = options;

  // Check cache
  if (useCache) {
    const cached = SEARCH_CACHE.get(query);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const results: SearchResult[] = [];
  const sources = new Set<string>();
  const searchedAt = new Date().toISOString();

  try {
    // Try primary search
    let primaryResults = await searchSearxng(query);
    if (primaryResults.length > 0) {
      results.push(...primaryResults);
      primaryResults.forEach((r) => sources.add(r.source));
    }

    // If we need more results, use fallback
    if (results.length < 5) {
      const fallbackResults = await searchDuckDuckGo(query);
      const newResults = fallbackResults.filter(
        (fr) => !results.some((r) => r.url === fr.url)
      );
      results.push(...newResults.slice(0, 5 - results.length));
      fallbackResults.forEach((r) => sources.add(r.source));
    }

    // Additional fallback
    if (results.length < 5) {
      const braveResults = await searchBrave(query);
      const newResults = braveResults.filter(
        (br) => !results.some((r) => r.url === br.url)
      );
      results.push(...newResults.slice(0, 5 - results.length));
      braveResults.forEach((r) => sources.add(r.source));
    }

    // Optionally fetch full content from top results
    if (fetchContent && results.length > 0) {
      const topResult = results[0];
      const content = await extractReaderContent(topResult.url);
      if (content) {
        topResult.snippet = content.substring(0, 500);
      }
    }

    const response: SearchResponse = {
      query,
      results: results.slice(0, 10),
      totalResults: results.length,
      searchedAt,
      sources: Array.from(sources),
    };

    // Cache the response
    if (useCache) {
      SEARCH_CACHE.set(query, { data: response, timestamp: Date.now() });
    }

    return response;
  } catch (error) {
    console.error("Web search failed:", error);
    return {
      query,
      results: [],
      totalResults: 0,
      searchedAt,
      sources: [],
    };
  }
}

/**
 * Format search results with proper citations for AI responses
 */
export function formatSearchResultsForAI(results: SearchResponse): string {
  if (results.results.length === 0) {
    return "No search results found.";
  }

  const timestamp = new Date(results.searchedAt).toLocaleString();
  let formatted = `\n📊 SEARCH RESULTS (${timestamp})\nQuery: "${results.query}"\nSources: ${results.sources.join(", ")}\n\n`;

  results.results.forEach((result, index) => {
    formatted += `[${index + 1}] ${result.title}\n`;
    formatted += `📍 Source: ${result.source}\n`;
    formatted += `🔗 URL: ${result.url}\n`;
    if (result.date) {
      formatted += `📅 Date: ${new Date(result.date).toLocaleDateString()}\n`;
    }
    formatted += `📝 Summary: ${result.snippet.substring(0, 250)}...\n\n`;
  });

  return formatted;
}

/**
 * Generate citation metadata for inline references
 */
export function generateCitations(results: SearchResponse): Record<string, any> {
  return {
    query: results.query,
    searchDate: results.searchedAt,
    resultCount: results.results.length,
    sources: results.sources,
    citations: results.results.map((r, i) => ({
      index: i + 1,
      title: r.title,
      url: r.url,
      domain: r.domain,
      retrievedDate: results.searchedAt,
      snippet: r.snippet,
    })),
  };
}

/**
 * Clear cache manually
 */
export function clearSearchCache(): void {
  SEARCH_CACHE.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: SEARCH_CACHE.size,
    entries: Array.from(SEARCH_CACHE.keys()),
  };
}