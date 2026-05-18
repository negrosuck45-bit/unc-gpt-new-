/**
 * Chat with Live Web Search Integration
 * - Automatically uses web search for current topics
 * - Proper source attribution
 * - Date-stamped responses
 * - Transparent about where information comes from
 */

import { searchWeb, generateCitations } from "@/lib/web-search-enhanced";

export interface ChatWithSearchOptions {
  query: string;
  model: string;
  systemPrompt?: string;
  includeSearchResults?: boolean;
  searchDepth?: "quick" | "deep" | "live";
}

export interface SearchEnrichedMessage {
  content: string;
  sources: string[];
  citations: Record<string, any>;
  searchedAt: string;
  hasSearchResults: boolean;
}

/**
 * Detect if query needs current web information
 */
function shouldUseWebSearch(query: string): boolean {
  const currentTopics = [
    "latest",
    "recent",
    "2024",
    "2025",
    "2026",
    "now",
    "today",
    "current",
    "breaking",
    "news",
    "update",
    "live",
    "real-time",
    "this week",
    "this month",
    "this year",
    "latest news",
    "recent news",
    "what's new",
    "trending",
    "hot topic",
    "current events",
  ];

  const lowerQuery = query.toLowerCase();
  return currentTopics.some((topic) => lowerQuery.includes(topic));
}

/**
 * Format search results into a context block for the AI model
 */
function createSearchContext(
  query: string,
  searchResults: Awaited<ReturnType<typeof searchWeb>>
): string {
  if (searchResults.results.length === 0) {
    return "No search results found. Proceed with general knowledge.";
  }

  const timestamp = new Date(searchResults.searchedAt).toLocaleString();
  let context = `\n=== LIVE WEB SEARCH RESULTS ===\nQuery: "${query}"\nSearched: ${timestamp}\nSources: ${searchResults.sources.join(", ")}\n\n`;

  searchResults.results.forEach((result, idx) => {
    context += `[SOURCE ${idx + 1}] ${result.title}\n`;
    context += `URL: ${result.url}\n`;
    context += `From: ${result.source}\n`;
    if (result.date) {
      context += `Date: ${new Date(result.date).toLocaleDateString()}\n`;
    }
    context += `Content: ${result.snippet}\n\n`;
  });

  context += `\nIMPORTANT INSTRUCTIONS FOR YOUR RESPONSE:\n`;
  context += `1. Cite sources directly: Use [SOURCE N] format when referencing\n`;
  context += `2. Include URLs: Always reference the source URL\n`;
  context += `3. Include dates: Mention when information was retrieved\n`;
  context += `4. Be transparent: Say "According to [source]..." when using search results\n`;
  context += `5. Don't fabricate: Only mention sources that are in the results above\n`;
  context += `6. For recent topics: Prioritize search results over old training data\n\n`;

  return context;
}

/**
 * Enrich user query with web search context if needed
 */
export async function enrichQueryWithSearch(
  userQuery: string,
  options: { searchDepth?: "quick" | "deep" | "live"; forceSearch?: boolean } = {}
): Promise<{
  enrichedPrompt: string;
  searchResults?: Awaited<ReturnType<typeof searchWeb>>;
  hasSearch: boolean;
}> {
  const { searchDepth = "quick", forceSearch = false } = options;

  // Check if search is needed
  const needsSearch = forceSearch || shouldUseWebSearch(userQuery);

  if (!needsSearch) {
    return {
      enrichedPrompt: userQuery,
      hasSearch: false,
    };
  }

  try {
    // Perform search
    const searchResults = await searchWeb(userQuery, {
      fetchContent: searchDepth === "deep",
      useCache: searchDepth !== "live",
    });

    // Create context for AI
    const searchContext = createSearchContext(userQuery, searchResults);

    // Combine original query with search context
    const enrichedPrompt = `${userQuery}\n\n${searchContext}`;

    return {
      enrichedPrompt,
      searchResults,
      hasSearch: true,
    };
  } catch (error) {
    console.error("Search enrichment failed:", error);
    // Gracefully degrade - continue without search
    return {
      enrichedPrompt: userQuery,
      hasSearch: false,
    };
  }
}

/**
 * Process AI response to add source attribution
 */
export function addSourceAttributionToResponse(
  response: string,
  searchResults?: Awaited<ReturnType<typeof searchWeb>>
): SearchEnrichedMessage {
  if (!searchResults || searchResults.results.length === 0) {
    return {
      content: response,
      sources: [],
      citations: {},
      searchedAt: new Date().toISOString(),
      hasSearchResults: false,
    };
  }

  // Extract sources mentioned in response
  const mentionedSources = new Set<string>();
  const citations = generateCitations(searchResults);

  // Look for source references in response
  const sourceRegex = /\[SOURCE\s+(\d+)\]/g;
  let match;
  while ((match = sourceRegex.exec(response)) !== null) {
    const sourceIdx = parseInt(match[1]) - 1;
    if (searchResults.results[sourceIdx]) {
      mentionedSources.add(searchResults.results[sourceIdx].url);
    }
  }

  // Add footer with sources if they were used
  let enrichedContent = response;
  if (mentionedSources.size > 0) {
    enrichedContent += `\n\n---\n**Sources Referenced** (Retrieved ${new Date(searchResults.searchedAt).toLocaleDateString()}):\n`;
    let idx = 1;
    mentionedSources.forEach((url) => {
      const result = searchResults.results.find((r) => r.url === url);
      if (result) {
        enrichedContent += `${idx}. [${result.domain}](${result.url})\n`;
        idx++;
      }
    });
  }

  return {
    content: enrichedContent,
    sources: searchResults.sources,
    citations,
    searchedAt: searchResults.searchedAt,
    hasSearchResults: true,
  };
}

/**
 * Create a system prompt that encourages proper source attribution
 */
export function createSearchAwareSystemPrompt(): string {
  return `You are UncGPT, an AI assistant with access to real-time web search.

CORE PRINCIPLES FOR RESPONSES:
1. ALWAYS cite sources when you reference the search results provided
2. Use the exact format: According to [SOURCE N], [claim]. (URL: [source_url], Retrieved: [date])
3. When you see [SOURCE N] markers in your context, reference them in your response
4. Always include the retrieved date when citing web sources
5. Be transparent: Distinguish between real-time search results and training data
6. For current events/news: Prioritize search results over training knowledge
7. Never fabricate sources or URLs - only reference what was provided

RESPONSE FORMAT:
- Start with direct answer
- Include source citations using [SOURCE N] format
- End with a sources section if multiple references used
- Always mention retrieval date for web sources

EXAMPLE FORMAT:
"According to [SOURCE 1], AI developments in 2026 include...(URL: [link], Retrieved: May 18, 2026). [SOURCE 2] adds that...

Remember: Transparency about sources builds user trust.`;
}

/**
 * Main chat function with search integration
 */
export async function getChatResponseWithSearch(
  userMessage: string,
  options: {
    model?: string;
    searchDepth?: "quick" | "deep" | "live";
    forceSearch?: boolean;
  } = {}
): Promise<SearchEnrichedMessage> {
  const { searchDepth = "quick", forceSearch = false } = options;

  try {
    // Enrich query with search if needed
    const { enrichedPrompt, searchResults, hasSearch } =
      await enrichQueryWithSearch(userMessage, {
        searchDepth,
        forceSearch,
      });

    // Note: Actual chat API call would happen here
    // This is just the enrichment/formatting layer

    return {
      content: enrichedPrompt,
      sources: searchResults?.sources || [],
      citations: searchResults ? generateCitations(searchResults) : {},
      searchedAt: new Date().toISOString(),
      hasSearchResults: hasSearch,
    };
  } catch (error) {
    console.error("Chat with search failed:", error);
    return {
      content: userMessage,
      sources: [],
      citations: {},
      searchedAt: new Date().toISOString(),
      hasSearchResults: false,
    };
  }
}