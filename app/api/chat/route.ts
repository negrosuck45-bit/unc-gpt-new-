import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { getComposioSession, getComposioUserId, getComposioUserIds, getEnabledComposioToolkits } from "@/lib/composio";
import { Composio } from "@composio/core";
import { chooseUncGptRoute } from "@/lib/uncgpt-router";
import { executeAgentGateway, gatewayResultText } from "@/lib/agent-gateway";
import { normalizeConnectorResult } from "@/lib/connector-results";

export const runtime = "nodejs";

const conversations = new Map<string, any>();

function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================
// TERMINAL CONFIG - UPDATE AFTER RENDER DEPLOYS
// ============================================================
const TERMINAL_API_URL = process.env.AGENT_COMPUTER_API_URL || "";
const TERMINAL_API_KEY = process.env.AGENT_COMPUTER_API_KEY || "";

async function runTerminalCommand(command: string, cwd: string = "/home/node"): Promise<string> {
  try {
    const res = await fetch(TERMINAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TERMINAL_API_KEY}`,
      },
      body: JSON.stringify({ command, cwd }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return `Terminal HTTP ${res.status}: ${errText}`;
    }

    const data = await res.json();
    const output = data.output || "";
    const error = data.error || null;

    // Format as markdown terminal block for the UI to parse
    let result = `\`\`\`terminal\n$ ${command}\n${output}`;
    if (error) {
      result += `\n[ERROR]: ${error}`;
    }
    result += `\n\`\`\``;

    return result;
  } catch (err: any) {
    return `Terminal execution failed: ${err.message}`;
  }
}

// ============================================================
// AGENT COMPUTER TOOLS
// ============================================================
// These tools are deliberately exposed to the same model tool loop as connected
// services. The model decides when they are needed; users do not need a special
// command prefix or a separate computer mode.
function buildAgentComputerTools() {
  const callGateway = async (task: string, tool: string, args: Record<string, unknown>) => {
    if (!process.env.AGENT_GATEWAY_URL && !process.env.AGENT_COMPUTER_API_URL) {
      return "Computer access is not configured for this deployment yet.";
    }
    try {
      const response = await executeAgentGateway({ task, tool, args });
      return gatewayResultText(response).slice(0, 12000);
    } catch (error: any) {
      return `Agent Computer error: ${error?.message || "request failed"}`;
    }
  };

  return [
    {
      type: "function",
      function: {
        name: "computer_browser",
        description: "Use the remote Agent Computer browser when the user asks you to open, navigate, inspect, search, or interact with a website. Do not use for answering general factual questions unless browsing is actually needed.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to open or inspect." },
            action: { type: "string", enum: ["open", "inspect", "click", "type", "scroll"], description: "Browser action." },
            instruction: { type: "string", description: "What to do in the browser." },
          },
          required: ["action", "instruction"],
          additionalProperties: false,
        },
      },
      _exec: async (args: any) => callGateway(
        `Browser task: ${args.action}. ${args.instruction}${args.url ? ` URL: ${args.url}` : ""}`,
        "browser",
        args || {},
      ),
    },
    {
      type: "function",
      function: {
        name: "computer_terminal",
        description: "Run a safe, user-requested command on the remote Agent Computer terminal. Use this for creating projects, checking versions, inspecting logs, or editing through shell commands. Never run destructive commands without explicit user intent.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "The terminal command to execute." },
            cwd: { type: "string", description: "Working directory, if relevant." },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
      _exec: async (args: any) => callGateway(
        `Terminal task: run this command${args.cwd ? ` in ${args.cwd}` : ""}: ${args.command}`,
        "terminal",
        args || {},
      ),
    },
    {
      type: "function",
      function: {
        name: "computer_filesystem",
        description: "Read, create, update, or inspect files on the remote Agent Computer filesystem when the user asks you to work with files or a project.",
        parameters: {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["read", "write", "edit", "list"], description: "Filesystem operation." },
            path: { type: "string", description: "Absolute or project-relative path." },
            content: { type: "string", description: "File content for write/edit operations." },
            instruction: { type: "string", description: "Additional details for the operation." },
          },
          required: ["operation", "path"],
          additionalProperties: false,
        },
      },
      _exec: async (args: any) => callGateway(
        `Filesystem task: ${args.operation} ${args.path}${args.instruction ? `. ${args.instruction}` : ""}${args.content ? ` Content:\n${args.content}` : ""}`,
        "filesystem",
        args || {},
      ),
    },
  ];
}

const BUILTIN_TOOLS: any[] = [];

async function executeBuiltInTool(toolName: string, args: any): Promise<string> {
  return `Tool ${toolName} is not available in this request`;
}

// ============================================================
// API KEYS & ENDPOINTS
// ============================================================
const CHAT_WORKER_URLS = [
  "https://old-hat-dab9.gamingac527.workers.dev",
  "https://aiagent.negro-suck45.workers.dev",
  "https://aged-wind-1e97.itzf302.workers.dev",
  "https://gentle-feather-3960.abdulrehmannn934.workers.dev",
  "https://cf-worker-1.blackmonkey098gg.workers.dev",
  "https://cf-worker-2.blackmonkey098gg.workers.dev",
  "https://cf-worker-3.blackmonkey098gg.workers.dev",
];
const IMAGE_VIDEO_WORKER_URL = "https://fragrant-band-d94a.blackmonkey098gg.workers.dev";
const IMAGE_MODELS = [
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/bytedance/stable-diffusion-xl-lightning",
  "@cf/lykon/dreamshaper-8-lcm",
  "@cf/leonardo-ai/lucid-origin",
  "@cf/leonardo-ai/phoenix-1.0",
];

const GROQ_CHAT_MODELS: Record<string, string> = {
  "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant": "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct": "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct": "meta-llama/llama-4-maverick-17b-128e-instruct",
  "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
  "mixtral-8x7b-32768": "mixtral-8x7b-32768",
  "compound-beta": "compound-beta",
  "compound-mini": "compound-mini",
};

const GROQ_KEYS: string[] = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
const BING_API_KEY = "";
const SEARXNG_INSTANCES = [
  "https://search.sapti.me",
  "https://search.bus-hit.me",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://searx.prvcy.eu",
];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || "";
const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY || process.env.CEREBRAS_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini";

let currentGroqKeyIndex = 0;
let currentChatIndex = 0;
const deadGroqKeys = new Set<number>();

const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "@cf/moonshot/kimi-k2.6",
  "@cf/moonshot/kimi-k2.5",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
];

function isVisionModel(model: string): boolean {
  return VISION_MODELS.some(v => model.toLowerCase().includes(v.toLowerCase()));
}

// ============================================================
// WEB SEARCH
// ============================================================
const SEARCH_TRIGGERS = [
  /what('s| is) (the )?(latest|current|recent|new)/i,
  /(latest|current|recent|new) (news|update|version|price|score|status)/i,
  /(today|yesterday|this week|this month|this year)/i,
  /(weather|stock|crypto|bitcoin|ethereum|price of)/i,
  /(who won|who lost|election|match|game|score)/i,
  /(release date|coming out|launch|announced)/i,
  /(died|passed away|birthday|age of)/i,
  /(net worth|how much|how many|population of)/i,
  /(search|look up|find out|google|check)/i,
  /\b(2024|2025|2026)\b.*\b(news|update|happened|event)\b/i,
  /btc|bitcoin|eth|ethereum|solana|cardano|crypto|xrp|doge/i,
  /nft|opensea|blur/i,
];

function shouldSearchWeb(text: string): boolean {
  return SEARCH_TRIGGERS.some(pattern => pattern.test(text));
}

function isCurrentDateOrTimeQuestion(text: string) {
  return /\b(what(?:['’]s| is) today|what(?:['’]s| is) (?:the )?(?:date|day|time)|what day is it|today['’]?s date|date today|current (?:date|day|time))\b/i.test(text.trim());
}

function isBitcoinPriceQuestion(text: string) {
  return /\b(bitcoin|btc)\b/i.test(text) && /\b(price|value|worth|cost|trading|rate|quote|how much|now|current|today)\b/i.test(text);
}

async function currentBitcoinPriceReply(countryCode?: string, locale?: string) {
  const currencyByCountry: Record<string, string> = { US: "usd", BR: "brl", GB: "gbp", DE: "eur", FR: "eur", ES: "eur", IT: "eur", PT: "eur", NL: "eur", IE: "eur", CA: "cad", AU: "aud", JP: "jpy", IN: "inr" };
  const currency = currencyByCountry[String(countryCode || "").toUpperCase()] || "usd";
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,${currency}&include_24hr_change=true&include_last_updated_at=true`, { headers: { Accept: "application/json", "User-Agent": "UncGPT/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    const data = await response.json();
    const bitcoin = data?.bitcoin;
    const amount = bitcoin?.[currency];
    const usd = bitcoin?.usd;
    if (typeof amount !== "number") throw new Error("Bitcoin price was unavailable");
    const formatter = new Intl.NumberFormat(locale || "en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: currency === "jpy" ? 0 : 2 });
    const change = typeof bitcoin?.usd_24h_change === "number" ? `24-hour USD change: ${bitcoin.usd_24h_change >= 0 ? "+" : ""}${bitcoin.usd_24h_change.toFixed(2)}%.` : "";
    const updated = typeof bitcoin?.last_updated_at === "number" ? new Date(bitcoin.last_updated_at * 1000).toISOString() : new Date().toISOString();
    return `Bitcoin is currently ${formatter.format(amount)}${currency !== "usd" && typeof usd === "number" ? ` (about $${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD)` : ""}. ${change} Live price retrieved at ${updated}. Source: https://www.coingecko.com/en/coins/bitcoin`;
  } catch (error: any) {
    return `I couldn’t retrieve a verified live Bitcoin price right now. The market-data request failed: ${error?.message || "temporary provider error"}. I won’t guess a price.`;
  }
}

function currentDateOrTimeReply(timeZone?: string, locale?: string) {
  const safeLocale = locale || "en-US";
  const safeTimeZone = timeZone || "UTC";
  try {
    const now = new Date();
    const date = new Intl.DateTimeFormat(safeLocale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: safeTimeZone,
    }).format(now);
    const time = new Intl.DateTimeFormat(safeLocale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: safeTimeZone,
      timeZoneName: "short",
    }).format(now);
    return `Today is ${date}. The current time is ${time}.`;
  } catch {
    const now = new Date();
    return `Today is ${now.toUTCString()}.`;
  }
}

async function searchSerpAPI(query: string): Promise<string> {
  if (!SERPAPI_KEY) return "";
  try {
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: SERPAPI_KEY,
      num: "8",
      hl: "en",
      gl: "us",
      tbs: "qdr:d",
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://serpapi.com/search?${params}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.log(`[SerpAPI] Failed: ${res.status}`);
      return "";
    }
    const data = await res.json();
    const results = data.organic_results || [];
    const answerBox = data.answer_box || {};
    const knowledgeGraph = data.knowledge_graph || {};
    if (!results.length && !answerBox.answer && !knowledgeGraph.description) {
      console.log("[SerpAPI] No results");
      return "";
    }
    let output = "";
    if (answerBox.answer || answerBox.snippet) {
      output += `DIRECT ANSWER: ${answerBox.answer || answerBox.snippet}\n\n`;
    }
    if (knowledgeGraph.description) {
      output += `FACTS: ${knowledgeGraph.description}\n`;
      if (knowledgeGraph.source?.link) {
        output += `Source: ${knowledgeGraph.source.link}\n\n`;
      }
    }
    results.slice(0, 5).forEach((r: any, i: number) => {
      const title = r.title || "No title";
      const snippet = r.snippet || r.description || "";
      const url = r.link || r.url || "";
      output += `RESULT ${i + 1}: ${title}\n${snippet.slice(0, 300)}\nSource: ${url}\n\n`;
    });
    console.log(`[SerpAPI] Success - ${results.length} results`);
    return output;
  } catch (err: any) {
    console.error("[SerpAPI] Error:", err.message);
    return "";
  }
}

async function searchBing(query: string): Promise<string> {
  if (!BING_API_KEY) return "";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=8&freshness=Day&mkt=en-US`,
      {
        method: "GET",
        headers: {
          "Ocp-Apim-Subscription-Key": BING_API_KEY,
          "Accept": "application/json",
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.log(`[Bing] Failed: ${res.status}`);
      return "";
    }
    const data = await res.json();
    const results = data.webPages?.value || [];
    if (!results.length) {
      console.log("[Bing] No results");
      return "";
    }
    let output = "";
    results.slice(0, 5).forEach((r: any, i: number) => {
      const title = r.name || "No title";
      const snippet = r.snippet || "";
      const url = r.url || "";
      output += `RESULT ${i + 1}: ${title}\n${snippet.slice(0, 300)}\nSource: ${url}\n\n`;
    });
    console.log(`[Bing] Success - ${results.length} results`);
    return output;
  } catch (err: any) {
    console.error("[Bing] Error:", err.message);
    return "";
  }
}

function decodeSearchHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

async function searchGoogleNewsRss(query: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, {
      headers: { "Accept": "application/rss+xml, application/xml, text/xml", "User-Agent": "UncGPT/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return "";
    const xml = await res.text();
    const clean = (value: string) => decodeSearchHtml(value.replace(/<!\[CDATA\[|\]\]>/g, "").trim());
    const output: string[] = [];
    for (const item of xml.match(/<item>[\s\S]*?<\/item>/gi) || []) {
      const title = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
      const link = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1];
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1];
      const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1];
      if (!title || !link) continue;
      output.push(`RESULT ${output.length + 1}: ${clean(title)}\n${source ? `Publisher: ${clean(source)}\n` : ""}${pubDate ? `Published: ${clean(pubDate)}\n` : ""}Source: ${clean(link)}\n`);
      if (output.length >= 8) break;
    }
    if (!output.length) return "";
    console.log(`[Google News RSS] Success - ${output.length} results`);
    return output.join("\n");
  } catch (err: any) {
    console.error("[Google News RSS] Error:", err.message);
    return "";
  }
}

async function searchJinaDuckDuckGo(query: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`https://r.jina.ai/http://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "Accept": "text/plain", "User-Agent": "UncGPT/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return "";
    const markdown = await res.text();
    const output: string[] = [];
    const resultPattern = /^## \[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\n([\s\S]*?)(?=\n## |$)/gm;
    for (const match of markdown.matchAll(resultPattern)) {
      const title = decodeSearchHtml(match[1]);
      let url = match[2];
      try {
        const parsed = new URL(url);
        url = parsed.searchParams.get("uddg") || url;
      } catch {}
      const snippet = decodeSearchHtml(match[3]).replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 400);
      if (!title || !url || /duckduckgo|captcha|about this page/i.test(title)) continue;
      output.push(`RESULT ${output.length + 1}: ${title}\n${snippet}\nSource: ${url}\n`);
      if (output.length >= 5) break;
    }
    if (!output.length) return "";
    console.log(`[Jina/DuckDuckGo] Success - ${output.length} results`);
    return output.join("\n");
  } catch (err: any) {
    console.error("[Jina/DuckDuckGo] Error:", err.message);
    return "";
  }
}

async function searchDuckDuckGo(query: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "Accept": "text/html", "User-Agent": "Mozilla/5.0 (compatible; UncGPT/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return "";
    const html = await res.text();
    const output: string[] = [];
    for (const block of html.split("result__body").slice(1)) {
      const link = block.match(/<a[^>]*class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const snippet = block.match(/class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/i) || block.match(/class=["']result__snippet["'][^>]*>([\s\S]*?)<\/div>/i);
      let url = link[1];
      try {
        const parsed = new URL(url, "https://html.duckduckgo.com");
        url = parsed.searchParams.get("uddg") || url;
      } catch {}
      output.push(`RESULT ${output.length + 1}: ${decodeSearchHtml(link[2])}\n${decodeSearchHtml(snippet?.[1] || "").slice(0, 400)}\nSource: ${url}\n`);
      if (output.length >= 5) break;
    }
    if (!output.length) return "";
    console.log(`[DuckDuckGo] Success - ${output.length} results`);
    return output.join("\n");
  } catch (err: any) {
    console.error("[DuckDuckGo] Error:", err.message);
    return "";
  }
}

async function searchSearXNG(query: string): Promise<string> {
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        language: "en",
        safesearch: "1",
        categories: "general",
      });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${instance}/search?${params}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; UncGPT/1.0)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;
      const data = await res.json();
      const results = data.results || [];
      if (!results.length) continue;
      let output = "";
      results.slice(0, 5).forEach((r: any, i: number) => {
        const title = r.title || "No title";
        const snippet = r.content || r.abstract || r.snippet || "";
        const url = r.url || r.link || "";
        output += `RESULT ${i + 1}: ${title}\n${snippet.slice(0, 300)}\nSource: ${url}\n\n`;
      });
      console.log(`[SearXNG] Success with ${instance}`);
      return output;
    } catch {
      continue;
    }
  }
  return "";
}

async function silentWebSearch(userQuery: string): Promise<string> {
  console.log(`[SilentSearch] Searching for: "${userQuery.substring(0, 80)}..."`);
  let result = await searchSerpAPI(userQuery);
  if (result) {
    console.log("[SilentSearch] Used SerpAPI");
    return result;
  }
  result = await searchBing(userQuery);
  if (result) {
    console.log("[SilentSearch] Used Bing");
    return result;
  }
  result = await searchGoogleNewsRss(userQuery);
  if (result) {
    console.log("[SilentSearch] Used Google News RSS");
    return result;
  }
  result = await searchJinaDuckDuckGo(userQuery);
  if (result) {
    console.log("[SilentSearch] Used Jina/DuckDuckGo");
    return result;
  }
  result = await searchDuckDuckGo(userQuery);
  if (result) {
    console.log("[SilentSearch] Used DuckDuckGo");
    return result;
  }
  // Do not use unreliable public SearXNG mirrors as a final source: stale results
  // are worse than transparently telling the model that live retrieval failed.
  console.log("[SilentSearch] All search sources failed");
  return "";
}

// ============================================================
// ATTACHMENT PROCESSING
// ============================================================
async function fetchLinkContent(url: string): Promise<string> {
  try {
    if (url.startsWith("blob:")) {
      return `[Error: Cannot access local browser blob URL: ${url}]`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UncGPT/1.0; +https://uncgpt.app)",
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return `[Failed to fetch URL: ${res.status}]`;
    const text = await res.text();
    const stripped = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    return `[Content from ${url}]:\n${stripped}`;
  } catch (err: any) {
    return `[Failed to fetch URL: ${err.message}]`;
  }
}

function decodeFileContent(dataUrl: string): string {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return "[Empty file]";
    return Buffer.from(base64, "base64").toString("utf-8").slice(0, 15000);
  } catch {
    return "[Could not decode file]";
  }
}

const visionImageUrlCache = new Map<string, string>();

async function normalizeVisionImageUrl(value: unknown): Promise<string> {
  const url = String(value || '').trim();
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (!/^https:\/\//i.test(url)) return url;
  const cached = visionImageUrlCache.get(url);
  if (cached) return cached;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'image/*' },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.ok || !contentType.startsWith('image/') || (contentLength > 8 * 1024 * 1024)) return url;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) return url;
    const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
    visionImageUrlCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return url;
  }
}

function sanitizeMessagesForAPI(messages: any[]): any[] {
  return messages.map(msg => {
    const sanitized: any = { role: msg.role, content: msg.content };
    if (msg.tool_calls) sanitized.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) sanitized.tool_call_id = msg.tool_call_id;
    if (msg.name) sanitized.name = msg.name;
    return sanitized;
  });
}

async function processAttachmentsForModel(
  messages: any[],
  targetModel: string,
  hasVision: boolean
): Promise<any[]> {
  const processed = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      processed.push(msg);
      continue;
    }
    const textParts: string[] = [];
    const imageParts: any[] = [];
    for (const part of msg.content) {
      if (part.type === "text") {
        textParts.push(part.text);
      } else if (part.type === "image_url") {
        const imageUrl = part.image_url.url;
        if (imageUrl.startsWith("blob:")) {
          textParts.push("[Image is still uploading - please wait for upload to complete]");
          continue;
        }
        if (hasVision) {
          const normalizedImageUrl = await normalizeVisionImageUrl(imageUrl);
          imageParts.push({ type: "image_url", image_url: { url: normalizedImageUrl } });
        } else {
          textParts.push(`[User attached an image. You can view it at: ${imageUrl}]`);
        }
      }
    }
    const combinedText = textParts.join("\n");
    const linkMatches = combinedText.match(/\[Attached (link|file): ([^\]]+)\]\(([^)]+)\)/g) || [];
    let processedText = combinedText;
    for (const match of linkMatches) {
      const urlMatch = match.match(/\(([^)]+)\)$/);
      if (urlMatch) {
        const url = urlMatch[1];
        if (url.startsWith("http") && !url.startsWith("blob:")) {
          const content = await fetchLinkContent(url);
          processedText = processedText.replace(match, `\n\n${content}`);
        } else if (url.startsWith("data:")) {
          const content = decodeFileContent(url);
          processedText = processedText.replace(match, `\n\n[File Content]:\n${content}`);
        }
      }
    }
    if (hasVision && imageParts.length > 0) {
      processed.push({
        role: msg.role,
        content: [
          { type: "text", text: processedText || "Please describe what you see in this image:" },
          ...imageParts,
        ],
      });
    } else {
      processed.push({
        role: msg.role,
        content: processedText || (imageParts.length > 0 ? "User attached an image." : ""),
      });
    }
  }
  return processed;
}

function convertMessageWithAttachments(msg: any): any {
  if (!msg.attachments || msg.attachments.length === 0) return msg;
  const content: any[] = [];
  if (msg.content && typeof msg.content === "string" && msg.content.trim()) {
    content.push({ type: "text", text: msg.content });
  }
  for (const att of msg.attachments) {
    if (att.type === "image") {
      const imageUrl = att.permanentUrl || att.url || att.visionUrl;
      if (imageUrl) content.push({ type: "image_url", image_url: { url: imageUrl } });
    }
  }
  return { ...msg, content: content.length > 0 ? content : msg.content };
}

// ============================================================
// MEDIA GENERATION
// ============================================================
function isVideoRequest(prompt: string): boolean {
  return /(video|animation|clip|film|movie|motion|footage|reel|short|timelapse|animate|cinematic|slow.?mo)/i.test(
    prompt
  );
}

function isImageRequest(prompt: string): boolean {
  return /(image|picture|photo|logo|art|icon|vector|illustration|wallpaper|portrait|poster|banner|thumbnail|drawing|sketch)/i.test(
    prompt
  );
}

function resolveMediaType(prompt: string): "video" | "image" | "chat" {
  if (isVideoRequest(prompt)) return "video";
  if (isImageRequest(prompt)) return "image";
  return "chat";
}

async function generateImage(prompt: string): Promise<string> {
  const timeoutMs = 45000;
  let lastError = "";
  for (const model of IMAGE_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(IMAGE_VIDEO_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "image", prompt, model, type: "image" }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = blob.type || "image/png";
        return `data:${mimeType};base64,${base64}`;
      }
      lastError = await res.text().catch(() => "Unknown error");
    } catch (err: any) {
      lastError = err.message;
    }
  }
  throw new Error(`Failed to generate image: ${lastError}`);
}

async function generateVideo(prompt: string, imageUrl?: string): Promise<string> {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://video.pollinations.ai/prompt/${encodedPrompt}?model=fast-svd&nologo=true`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(pollinationsUrl, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return `data:video/mp4;base64,${base64}`;
    }
  } catch (err: any) {
    console.log("[Video] Pollinations failed:", err.message);
  }
  throw new Error(
    "Video generation is currently limited. Try generating an image instead by saying 'generate an image of...'"
  );
}

async function generateMedia(
  task: "image" | "video",
  prompt: string,
  image?: string
): Promise<string> {
  if (task === "video") return generateVideo(prompt, image);
  return generateImage(prompt);
}

// ============================================================
// PROVIDER CALLS WITH TOOLS SUPPORT
// ============================================================

// Keep provider instructions focused on ordinary chat; never expose internal tools.
const UNCGPT_IDENTITY_PROMPT = `You are uncgpt, the AI inside the uncgpt workspace at unc-gptt.vercel.app. uncgpt provides chat, projects and memory, file/reference search, image generation, optional computer-use capabilities, and user-authorized connectors through MCP and Composio. You should understand these capabilities, explain them accurately when asked, and use a connected service only when the user has connected and authorized it. Never claim a capability, account, external result, or action is available unless the current request and its verified tools show that it is.`;

function safeRuntimeContextValue(value: unknown, pattern: RegExp, maxLength: number) {
  const text = String(value || "").trim();
  return pattern.test(text) ? text.slice(0, maxLength) : undefined;
}

function buildRuntimeContextMessage({
  clientTimeZone,
  clientLocale,
  clientCountry,
  clientCountryCode,
}: {
  clientTimeZone?: unknown;
  clientLocale?: unknown;
  clientCountry?: unknown;
  clientCountryCode?: unknown;
}) {
  const timeZone = safeRuntimeContextValue(clientTimeZone, /^[A-Za-z_+\-/]{1,80}$/, 80);
  const locale = safeRuntimeContextValue(clientLocale, /^[A-Za-z0-9_-]{2,35}$/, 35);
  const country = safeRuntimeContextValue(clientCountry, /^[A-Za-z .'-]{2,80}$/, 80);
  const countryCode = safeRuntimeContextValue(clientCountryCode, /^[A-Z]{2}$/i, 2)?.toUpperCase();
  const parts = [
    timeZone ? `timezone: ${timeZone}` : "timezone: unavailable",
    locale ? `locale: ${locale}` : "locale: unavailable",
    country ? `approximate country: ${country}${countryCode ? ` (${countryCode})` : ""}` : "approximate country: unavailable",
  ];
  return `Runtime context for this turn (device-provided; may be approximate): ${parts.join("; ")}. Raw IP address, city, ISP, hostname, and precise location were not provided. Use timezone for local dates/times and country only when it is relevant.`;
}

const TERMINAL_SYSTEM_PROMPT = `You are uncgpt, a helpful AI assistant. Answer the user's request directly and clearly.

Infer the user's intent from ordinary language and complete the requested task using an actually connected service whenever one is available. Do not require special prefixes, connector names, or instructions such as “use a tool.” For read-only requests and routine actions that the user explicitly requested, proceed immediately without asking for confirmation. Only pause for confirmation immediately before an irreversible, destructive, financial, privacy-sensitive, or externally visible action when the user has not already clearly authorized that exact action. Never ask the user to confirm merely because a connector is being used.

For connected Composio apps, call the matching connected-app function directly with the user’s request and use its real result. This includes create, add, edit, update, modify, send, publish, deploy, commit, and manage requests—not only read requests. Do not answer as a generic bot, do not describe what the app could theoretically do, do not invent sample data, and do not claim access unless the tool result proves it. If a write tool requires a missing value that cannot be inferred safely, ask only for that value. If a needed connector is genuinely not connected, return one concise sentence naming the connector and the single Settings action required; do not repeat setup instructions or ask unnecessary questions.

When the user asks to build or publish a website in GitHub, perform the work rather than only showing code. Create or update every requested file using the GitHub file tool with the complete file contents and a clear commit message; never claim files exist until GitHub confirms the write. For Vercel publishing, use the connected Vercel deployment tool only after the repository files are committed, and report the verified deployment URL/status. For GitHub Pages, enable Pages and request a build after the files are committed; use the correct URL format: https://OWNER.github.io/REPO/ for a project site, or https://OWNER.github.io/ when the repository itself is named OWNER.github.io. If the user asks for both hosts, complete both workflows and report each verified URL separately. If the owner, repository, file path, or required website content is missing, ask only for the missing value.

Keep final responses concise and natural: usually one short paragraph or a compact list, like ChatGPT. Do not narrate reasoning, tool names, intermediate steps, command syntax, or implementation details. For connector requests, use the connected service silently and return the verified result. When a connector returns multiple records or rows, present them as a compact Markdown table with useful columns; use short labeled sections or key-value cards for nested details. Do not dump raw JSON, huge paragraphs, or a long unstructured bullet list when a table is clearer. Never claim an external action succeeded unless a tool result confirms it.`;

async function callGroq(
  messages: any[],
  model: string,
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const groqModel = hasImage
    ? "meta-llama/llama-4-scout-17b-16e-instruct"
    : GROQ_CHAT_MODELS[model] ?? "llama-3.3-70b-versatile";
  const hasVision = isVisionModel(groqModel);
  const processedMessages = await processAttachmentsForModel(
    cleanMessages,
    groqModel,
    hasVision
  );

  const availableKeys = GROQ_KEYS.map((key, idx) => ({ key, idx })).filter(
    ({ idx }) => !deadGroqKeys.has(idx)
  );
  if (availableKeys.length === 0) throw new Error("All Groq keys dead");

  for (let attempt = 0; attempt < availableKeys.length; attempt++) {
    const { key, idx } =
      availableKeys[(currentGroqKeyIndex + attempt) % availableKeys.length];
    if (!key || key.length < 20) continue;

    try {
      const requestBody: any = {
        model: groqModel,
        messages: [
          { role: "system", content: TERMINAL_SYSTEM_PROMPT },
          ...processedMessages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      // Vision endpoints are kept tool-free: Composio schemas can make
      // otherwise valid image requests fail provider validation.
      if (!hasImage && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = "auto";
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (res.status === 401) {
        deadGroqKeys.add(idx);
        continue;
      }
      if (res.status === 429) continue;
      if (res.ok) {
        currentGroqKeyIndex = (currentGroqKeyIndex + 1) % availableKeys.length;
        return { stream: res.body!, provider: "Groq", model: groqModel };
      }
      if (res.status === 404 && groqModel.includes("llama-4")) {
        const fallbackBody = {
          ...requestBody,
          model: "llama-3.2-90b-vision-preview",
        };
        const fallbackRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(fallbackBody),
        });
        if (fallbackRes.ok) return { stream: fallbackRes.body!, provider: "Groq", model: "llama-3.2-90b-vision-preview" };
      }
    } catch {}
  }

  throw new Error("All Groq keys failed");
}

async function callOpenAI(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!OPENAI_KEY) throw new Error("OpenAI key not configured");

  const cleanMessages = sanitizeMessagesForAPI(messages);
  const processedMessages = await processAttachmentsForModel(
    cleanMessages,
    OPENAI_CHAT_MODEL,
    hasImage
  );
  const body: any = {
    model: OPENAI_CHAT_MODEL,
    messages: [
      { role: "system", content: TERMINAL_SYSTEM_PROMPT },
      ...processedMessages,
    ],
    stream: true,
    temperature: 0.35,
    max_tokens: 4096,
  };
  if (!hasImage && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI failed: ${response.status} ${detail.slice(0, 160)}`);
  }
  return { stream: response.body, provider: "OpenAI", model: OPENAI_CHAT_MODEL };
}

async function callOpenRouter(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const visionModels = [
    "openrouter/free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
  ];
  const textModels = [
    "meta-llama/llama-3.1-8b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
  ];

  const modelsToTry = hasImage ? visionModels : textModels;

  for (const modelId of modelsToTry) {
    try {
      const headers: any = { "Content-Type": "application/json" };
      if (OPENROUTER_KEY) {
        headers["Authorization"] = `Bearer ${OPENROUTER_KEY}`;
        headers["HTTP-Referer"] = "https://uncgpt.app";
        headers["X-Title"] = "UncGPT";
      }

      const processedMessages = hasImage
        ? await processAttachmentsForModel(cleanMessages, modelId, true)
        : cleanMessages;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const body: any = {
        model: modelId,
        messages: [
          { role: "system", content: TERMINAL_SYSTEM_PROMPT },
          ...processedMessages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      if (!hasImage && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (res.ok) return { stream: res.body!, provider: "OpenRouter (Free)", model: modelId };
    } catch {}
  }

  throw new Error("All OpenRouter free models failed");
}

async function callHuggingFaceVision(
  messages: any[],
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!HF_TOKEN) throw new Error("Hugging Face token not configured");
  const models = ["google/gemma-4-31B-it", "google/gemma-3-12b-it"];
  const cleanMessages = sanitizeMessagesForAPI(messages);
  let lastError = "";
  for (const model of models) {
    try {
      const processedMessages = await processAttachmentsForModel(cleanMessages, model, true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(HF_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HF_TOKEN}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are uncgpt vision. Analyze the attached image and answer the user clearly. Do not use tools." },
            ...processedMessages,
          ],
          stream: true,
          temperature: 0.2,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok && res.body) {
        return { stream: res.body, provider: "Hugging Face", model };
      }
      lastError = `${res.status} ${(await res.text().catch(() => "")).slice(0, 180)}`;
    } catch (error: any) {
      lastError = error?.message || "request failed";
    }
  }
  throw new Error(`Hugging Face vision failed: ${lastError}`);
}

async function callCerebras(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!CEREBRAS_KEY) throw new Error("Cerebras API key not configured");
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const model = hasImage ? "gemma-4-31b" : "llama-3.3-70b";
  const processedMessages = hasImage
    ? await processAttachmentsForModel(cleanMessages, model, true)
    : cleanMessages;

  const body: any = {
    model,
    messages: [
      { role: "system", content: TERMINAL_SYSTEM_PROMPT },
      ...processedMessages,
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (!hasImage && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (res.ok) return { stream: res.body!, provider: "Cerebras", model };
  const err = await res.text().catch(() => "");
  throw new Error(`Cerebras failed: ${res.status} ${err.slice(0, 100)}`);
}

async function callChatWorkers(
  body: any,
  model: string,
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cfModel = model.startsWith("@cf/") ? model : "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

  for (let i = 0; i < CHAT_WORKER_URLS.length; i++) {
    const index = (currentChatIndex + i) % CHAT_WORKER_URLS.length;
    const url = CHAT_WORKER_URLS[index];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);

      const messagesToSend = hasImage
        ? (body.messages || []).map((m: any) => ({
            role: m.role,
            content: Array.isArray(m.content)
              ? m.content.map((c: any) => {
                  if (c.type === "text") return { type: "text", text: c.text };
                  if (c.type === "image_url")
                    return {
                      type: "image_url",
                      image_url: { url: c.image_url.url },
                    };
                  return c;
                })
              : m.content,
          }))
        : (body.messages || []).map((m: any) => ({
            role: m.role,
            content: Array.isArray(m.content)
              ? m.content.find((c: any) => c.type === "text")?.text || ""
              : m.content,
          }));

      const reqBody: any = {
        ...body,
        model: cfModel,
        messages: messagesToSend,
        ...(hasImage && { vision: true }),
      };

      if (!hasImage && tools.length > 0) {
        reqBody.tools = tools;
        reqBody.tool_choice = "auto";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (res.ok) {
        currentChatIndex = (index + 1) % CHAT_WORKER_URLS.length;
        return { stream: res.body!, provider: "Cloudflare", model: cfModel };
      }
    } catch {}
  }

  throw new Error("All Cloudflare chat workers failed");
}

async function fallbackChat(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const errors: string[] = [];

  if (hasImage) {
    if (OPENAI_KEY) {
      try {
        return await callOpenAI(messages, true, tools);
      } catch (err: any) {
        errors.push(`OpenAI: ${err.message}`);
      }
    }
    if (HF_TOKEN) {
      try {
        return await callHuggingFaceVision(messages, tools);
      } catch (err: any) {
        errors.push(`Hugging Face: ${err.message}`);
      }
    }
    // Try Cerebras only after Hugging Face, because this deployment may be on a paid-only key.
    if (CEREBRAS_KEY) {
      try {
        return await callCerebras(messages, true, tools);
      } catch (err: any) {
        errors.push(`Cerebras: ${err.message}`);
      }
    }
    try {
      return await callOpenRouter(messages, true, tools);
    } catch (err: any) {
      errors.push(`OpenRouter: ${err.message}`);
    }
    try {
      return await callGroq(
        messages,
        "meta-llama/llama-4-scout-17b-16e-instruct",
        true,
        tools
      );
    } catch (err: any) {
      errors.push(`Groq: ${err.message}`);
    }
    throw new Error(`No vision providers: ${errors.join(", ")}`);
  }

  if (OPENAI_KEY) {
    try {
      return await callOpenAI(messages, false, tools);
    } catch (err: any) {
      errors.push(`OpenAI: ${err.message}`);
    }
  }
  try {
    return await callGroq(messages, "llama-3.3-70b-versatile", false, tools);
  } catch (err: any) {
    errors.push(`Groq: ${err.message}`);
  }
  try {
    return await callOpenRouter(messages, false, tools);
  } catch (err: any) {
    errors.push(`OpenRouter: ${err.message}`);
  }
  try {
    return await callChatWorkers(
      { task: "chat", messages },
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      false,
      tools
    );
  } catch (err: any) {
    errors.push(`Cloudflare: ${err.message}`);
  }

  throw new Error(`All providers failed: ${errors.join(", ")}`);
}

// ============================================================
// MCP TOOLS
// ============================================================
async function callMcpJsonRpc(connector: any, method: string, params: any = {}) {
  const response = await fetch(connector.url, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      ...connector.headers,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`MCP ${response.status}: ${await response.text().catch(() => "")}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const events = text.split(/\\n\\n+/).reverse();
    for (const event of events) {
      const line = event.split("\\n").find((value) => value.startsWith("data:"));
      if (!line) continue;
      try {
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.error) throw new Error(payload.error.message || "MCP request failed");
        if (payload.result) return payload.result;
      } catch (error: any) {
        if (error?.message && !error.message.includes("Unexpected token")) throw error;
      }
    }
    throw new Error("MCP stream returned no result");
  }
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "MCP request failed");
  return payload.result ?? payload;
}

async function fetchMcpTools(connectors: any[], baseUrl: string): Promise<any[]> {
  if (!connectors?.length) return [];
  const enabled = connectors.filter(
    (c: any) => c.enabled && c.type === "http" && c.url
  );
  if (!enabled.length) return [];

  const tools: any[] = [];

  await Promise.all(
    enabled.map(async (c: any) => {
      try {
        const callMcpEndpoint = async (
          _action: string,
          method?: string,
          params?: any
        ) => callMcpJsonRpc(c, method || _action, params || {});

        try {
          await callMcpEndpoint("initialize", "initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "uncgpt", version: "1.0" },
          });
        } catch {}

        const r = await callMcpEndpoint("list-tools", "tools/list", {});

        for (const t of r?.tools || []) {
          tools.push({
            type: "function",
            function: {
              name: `${c.id}__${t.name}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
              description: `[${c.name}] ${t.description || t.name}`,
              parameters: t.inputSchema || { type: "object", properties: {} },
            },
            _connector: c,
            _toolName: t.name,
          });
        }
      } catch (e: any) {
        console.error(`MCP ${c.name} failed:`, e.message);
      }
    })
  );

  return tools;
}

async function executeMcpTool(
  tool: any,
  args: any,
  _baseUrl: string
): Promise<string> {
  try {
    const result = await callMcpJsonRpc(tool._connector, "tools/call", {
      name: tool._toolName,
      arguments: args,
    });
    if (!result) return "Tool error: MCP returned no result.";
    const content = Array.isArray(result.content)
      ? result.content.map((part: any) => part.text ?? part.data ?? part).join("\n")
      : result;
    return normalizeConnectorResult(content, `${tool._connector?.name || ""} ${tool._toolName || ""}`);
  } catch (error: any) {
    return `Tool error: ${error?.message || "MCP execution failed"}`;
  }
}

function isReadOnlyConnectorRequest(text: string) {
  return /\b(latest|recent|list|show|find|search|read|get|fetch|my|inbox|messages|emails?|files?|events?|issues?|repositories|repos)\b/i.test(text) && !/\b(send|create|update|edit|delete|remove|post|publish|deploy|commit|push|close|archive)\b/i.test(text);
}

function defaultReadToolArguments(schema: any): Record<string, unknown> | null {
  const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const args: Record<string, unknown> = {};
  for (const name of required) {
    const property = properties[name] || {};
    if (["limit", "max_results", "maxResults", "page_size", "pageSize", "count"].includes(name)) {
      args[name] = Math.min(Number(property.maximum) || 10, 10);
    } else if (property.default !== undefined) {
      args[name] = property.default;
    } else {
      return null;
    }
  }
  for (const name of ["limit", "max_results", "maxResults", "page_size", "pageSize", "count"]) {
    if (properties[name] && args[name] === undefined) args[name] = Math.min(Number(properties[name].maximum) || 10, 10);
  }
  return args;
}

function isSafeReadConnectorTool(tool: any) {
  const descriptor = `${tool?.function?.name || ""} ${tool?.function?.description || ""}`.toLowerCase();
  return /\b(fetch|get|list|search|read|find|retrieve)\b/.test(descriptor) && !/\b(send|create|update|edit|delete|remove|post|publish|deploy|commit|push|close|archive)\b/.test(descriptor);
}

function isUnavailableEmailField(value: unknown) {
  return value == null || value === "" || value === "unavailable";
}

function parseNormalizedEmailResult(value: string): { emails: any[]; note?: string } {
  try {
    const parsed = JSON.parse(value);
    return { emails: Array.isArray(parsed?.emails) ? parsed.emails : [], note: parsed?.note };
  } catch {
    return { emails: [] };
  }
}

function mergeNormalizedEmail(base: any, detail: any) {
  const merged = { ...base };
  for (const field of ["sender", "senderPhoto", "recipient", "subject", "date", "messageId", "threadId", "snippet", "body"]) {
    if (isUnavailableEmailField(merged[field]) && !isUnavailableEmailField(detail?.[field])) merged[field] = detail[field];
    if (field === "body" && !isUnavailableEmailField(detail?.[field])) merged[field] = detail[field];
    if (field === "senderPhoto" && !isUnavailableEmailField(detail?.[field])) merged[field] = detail[field];
  }
  const attachments = [...(Array.isArray(base?.attachments) ? base.attachments : []), ...(Array.isArray(detail?.attachments) ? detail.attachments : [])];
  merged.attachments = [...new Map(attachments.map((attachment: any) => [`${attachment?.id || ""}:${attachment?.filename || ""}`, attachment])).values()];
  return merged;
}

async function executeLatestGmailMessages(session: any) {
  // The list action can legally return metadata-only rows even when verbose and
  // include_payload are requested. Hydrate those rows with the dedicated full
  // message action so the UI always receives the actual text that was sent.
  const result = await session.execute("GMAIL_FETCH_EMAILS", {
    user_id: "me",
    max_results: 30,
    verbose: true,
    ids_only: false,
    include_payload: true,
  });
  if (result?.error) throw new Error(String(result.error));

  const normalized = parseNormalizedEmailResult(normalizeConnectorResult(result?.data ?? result, "GMAIL_FETCH_EMAILS"));
  console.info("Gmail list normalized", {
    emailCount: normalized.emails.length,
    bodyCount: normalized.emails.filter((email: any) => !isUnavailableEmailField(email?.body)).length,
    hydrationCount: normalized.emails.filter((email: any) => !isUnavailableEmailField(email?.messageId) && isUnavailableEmailField(email?.body)).length,
  });
  const emailsNeedingHydration = normalized.emails.filter((email: any) =>
    !isUnavailableEmailField(email?.messageId) && isUnavailableEmailField(email?.body)
  );

  for (let offset = 0; offset < emailsNeedingHydration.length; offset += 6) {
    const batch = emailsNeedingHydration.slice(offset, offset + 6);
    await Promise.all(batch.map(async (email: any) => {
      let detailed: any = null;
      let detailSlug = "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID";
      try {
        detailed = await session.execute(detailSlug, {
          user_id: "me",
          message_id: email.messageId,
          format: "full",
        });

        // Some older Gmail connections expose thread hydration more reliably
        // than single-message hydration. Fall back to the thread when needed.
        if (detailed?.error && !isUnavailableEmailField(email?.threadId)) {
          detailSlug = "GMAIL_FETCH_MESSAGE_BY_THREAD_ID";
          detailed = await session.execute(detailSlug, {
            user_id: "me",
            thread_id: email.threadId,
          });
        }
        if (detailed?.error) {
          console.warn("Gmail detail action returned an error", { messageId: email.messageId, detailSlug, error: String(detailed.error) });
          return;
        }
        let detailResult = parseNormalizedEmailResult(normalizeConnectorResult(detailed?.data ?? detailed, detailSlug));
        let detail = detailResult.emails.find((candidate: any) => candidate?.messageId === email.messageId) || detailResult.emails[0];
        if ((!detail || isUnavailableEmailField(detail.body)) && detailSlug === "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID") {
          try {
            const rawResponse = await session.execute("GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", {
              user_id: "me",
              message_id: email.messageId,
              format: "raw",
            });
            if (!rawResponse?.error) {
              const rawData = rawResponse?.data ?? rawResponse;
              const rawPayload = typeof rawData === "string"
                ? { id: email.messageId, threadId: email.threadId, raw: rawData }
                : rawData;
              detailResult = parseNormalizedEmailResult(normalizeConnectorResult(rawPayload, "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"));
              detail = detailResult.emails.find((candidate: any) => candidate?.messageId === email.messageId) || detailResult.emails[0];
            }
          } catch (rawError) {
            console.warn("Gmail raw-message fallback failed", { messageId: email.messageId, error: String(rawError) });
          }
        }
        if (!detail) {
          console.warn("Gmail detail action returned no normalizable body", { messageId: email.messageId, detailSlug });
          return;
        }
        const index = normalized.emails.findIndex((candidate: any) => candidate?.messageId === email.messageId);
        if (index >= 0) normalized.emails[index] = mergeNormalizedEmail(normalized.emails[index], detail);
      } catch (error) {
        console.warn("Gmail full-message hydration failed", { messageId: email.messageId, detailSlug, error: String(error) });
      }
    }));
  }

  console.info("Gmail hydration complete", {
    emailCount: normalized.emails.length,
    bodyCount: normalized.emails.filter((email: any) => !isUnavailableEmailField(email?.body)).length,
  });
  return JSON.stringify(normalized.emails.length ? { emails: normalized.emails.slice(0, 50) } : { emails: [], note: normalized.note || "The connected Gmail tool returned no email records." }, null, 2);
}

function normalizeConnectorKeyForRouting(value: unknown) {
  return String(value || '').toLowerCase().replace(/[- ]/g, '_').replace(/[^a-z0-9_]/g, '');
}

function connectorKeysMatch(left: unknown, right: unknown) {
  return normalizeConnectorKeyForRouting(left).replace(/_/g, '') === normalizeConnectorKeyForRouting(right).replace(/_/g, '');
}

function composioToolkitSlug(key: unknown) {
  const normalized = normalizeConnectorKeyForRouting(key).replace(/_/g, '');
  if (normalized === 'googlecalendar') return 'googlecalendar';
  if (normalized === 'googledrive') return 'googledrive';
  return normalized;
}

function isGithubCreateRepositoryRequest(text: string) {
  return /\b(?:create|make|new|set\s+up)\b[\s\S]{0,100}\b(?:github\s+)?(?:repo|repository)\b/i.test(text) || /\b(?:github\s+)?(?:repo|repository)\b[\s\S]{0,100}\b(?:create|make|new)\b/i.test(text);
}

function extractGithubRepositoryName(text: string): string | null {
  const named = text.match(/\b(?:named|called)\s+["'“”`]?([A-Za-z0-9][A-Za-z0-9._-]{0,99})["'“”`]?/i)?.[1];
  if (named) return named.trim();
  const compact = text.match(/\b(?:repo|repository)\s+(?:called\s+|named\s+)?["'“”`]?([A-Za-z0-9][A-Za-z0-9._-]{0,99})["'“”`]?\s*$/i)?.[1];
  return compact?.trim() || null;
}

function sanitizeGithubRepositoryName(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || "uncgpt-site";
}

function generateWebsiteRepositoryName(userText: string) {
  const requested = extractGithubRepositoryName(userText);
  if (requested) return sanitizeGithubRepositoryName(requested);
  const source = String(userText || "").toLowerCase();
  const base = /count\s*down/i.test(source) ? "countdown" : /hello\s+world/i.test(source) ? "hello-world" : /portfolio/i.test(source) ? "portfolio" : /landing/i.test(source) ? "landing-page" : "uncgpt-site";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${base}-${suffix}`;
}

function isWebsiteFollowUpRequest(text: string, conversationText: string) {
  const followUpIntent = /\b(?:create|build|make|generate|deploy|publish|launch|set\s*up|do\s+it|go\s+ahead|make\s+it\s+live)\b/i.test(text);
  const websiteContext = /\b(?:website|web\s*site|landing\s*page|portfolio|(?:hello\s+world\s+)?page|index\.(?:html|md)|github\s*pages|github\.io|vercel)\b/i.test(conversationText);
  const repositoryContext = /\b(?:github|repository|repo|github\s*pages|github\.io|vercel|live\s+page)\b/i.test(conversationText);
  return followUpIntent && websiteContext && repositoryContext;
}

async function executeOAuthGithubAction(baseUrl: string, cookieHeader: string, action: string, params: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/mcp/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({ action, ...params }),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || `GitHub action failed (${response.status})`);
  return data?.data ?? data;
}

async function executeOAuthVercelAction(baseUrl: string, cookieHeader: string, action: string, params: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/mcp/vercel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({ action, ...params }),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || `Vercel action failed (${response.status})`);
  return data?.data ?? data;
}

function extractGithubRepositoryRef(text: string): { owner: string; repo: string } | null {
  const matches = [...String(text || "").matchAll(/\b([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})\b/g)];
  const placeholders = new Set(["your-username", "your-repo-name", "username", "repo-name", "owner", "repository"]);
  const match = matches.reverse().find((candidate) => {
    const owner = String(candidate[1] || "").toLowerCase();
    const repo = String(candidate[2] || "").replace(/\.git$/i, "").toLowerCase();
    return !placeholders.has(owner) && !placeholders.has(repo) && !owner.includes("example") && !repo.includes("example");
  });
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/i, "") } : null;
}

function isWebsiteBuildRequest(text: string) {
  const creationIntent = /\b(?:create|build|make|generate|set\s+up|publish|deploy|launch)\b/i.test(text);
  const pageIntent = /\b(?:website|web\s+site|landing\s+page|portfolio|(?:hello\s+world\s+)?page|index\.(?:html|md)|github\s*pages|github\.io|live\s+page)\b/i.test(text);
  const repositoryIntent = /\b(?:github|repository|repo|github\.io|vercel)\b/i.test(text);
  return creationIntent && pageIntent && repositoryIntent;
}

function githubErrorText(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > 3) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.message} ${githubErrorText((value as any).cause, depth + 1)}`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prioritized = [record.message, record.error, record.detail, record.statusText, record.data, record.body, record.response, record.cause]
      .map((candidate) => githubErrorText(candidate, depth + 1))
      .filter(Boolean)
      .join(" ");
    if (prioritized) return prioritized;
    try { return JSON.stringify(value); } catch { return ""; }
  }
  return String(value);
}

function isMissingGithubRepositoryError(error: unknown) {
  const message = githubErrorText(error).toLowerCase();
  return /(?:\b404\b|not\s+found|does\s+not\s+exist|could\s+not\s+find\s+(?:the\s+)?repository|repository\s+.*(?:missing|unavailable))/i.test(message);
}

function escapeTemplateHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\\"": "&quot;", "'": "&#39;" } as Record<string, string>)[character] || character);
}

function buildPortfolioFiles(userText: string) {
  const forwardCountdown = userText.match(/\bcount\s*down[\s\S]{0,48}?(?:from\s*)?(\d{1,6})\s*(?:to|down\s+to)\s*(\d{1,6})\b/i);
  const reverseCountdown = userText.match(/\bcount\s*down[\s\S]{0,48}?to\s*(\d{1,6})[\s\S]{0,48}?from\s*(\d{1,6})\b/i);
  if (forwardCountdown || reverseCountdown) {
    const start = Math.max(0, Number(forwardCountdown?.[1] ?? reverseCountdown?.[2] ?? 100));
    const end = Math.max(0, Number(forwardCountdown?.[2] ?? reverseCountdown?.[1] ?? 0));
    return {
      "index.html": `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="description" content="An interactive countdown created by uncgpt.">\n  <title>${start} to ${end} Countdown</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="shell">\n    <section class="card" aria-labelledby="title">\n      <p class="eyebrow">Live countdown</p>\n      <h1 id="title">${start} <span>→</span> ${end}</h1>\n      <output id="counter" aria-live="polite">${start}</output>\n      <div class="actions"><button id="start" type="button">Start countdown</button><button id="reset" class="secondary" type="button">Reset</button></div>\n      <p id="status">Ready to count down to ${end}.</p>\n    </section>\n  </main>\n  <script>window.COUNTDOWN_CONFIG={start:${start},end:${end}};</script>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
      "style.css": `:root{color-scheme:dark;--bg:#070a13;--text:#f8fafc;--muted:#9fb0cc;--accent:#74f2bf;--line:rgba(255,255,255,.14)}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;background:radial-gradient(circle at 50% 0,#233b77 0,transparent 44%),var(--bg);color:var(--text);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}.shell{width:min(100% - 30px,680px)}.card{padding:clamp(2.4rem,8vw,5rem);text-align:center;border:1px solid var(--line);border-radius:32px;background:rgba(13,20,38,.8);box-shadow:0 28px 90px rgba(0,0,0,.42)}.eyebrow{margin:0;color:var(--accent);font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.card h1{margin:.5rem 0 0;font-size:clamp(2rem,8vw,4.6rem);letter-spacing:-.06em}.card h1 span{color:var(--accent)}output{display:block;margin:.8rem 0 1.5rem;font-size:clamp(7rem,28vw,13rem);font-weight:850;letter-spacing:-.12em;line-height:.85;color:var(--accent);font-variant-numeric:tabular-nums}.actions{display:flex;justify-content:center;gap:.75rem;flex-wrap:wrap}button{border:1px solid var(--accent);border-radius:999px;padding:.78rem 1.15rem;background:var(--accent);color:#062017;font:inherit;font-weight:800;cursor:pointer;transition:transform .16s ease,filter .16s ease}button:hover{transform:translateY(-2px);filter:brightness(1.07)}button.secondary{border-color:var(--line);background:transparent;color:var(--text)}button:disabled{opacity:.55;cursor:not-allowed;transform:none}#status{min-height:1.5em;margin:1.3rem 0 0;color:var(--muted)}@media(max-width:460px){.card{padding:2.5rem 1.3rem;border-radius:25px}}\n`,
      "script.js": `const {start,end}=window.COUNTDOWN_CONFIG;const counter=document.getElementById('counter');const status=document.getElementById('status');const startButton=document.getElementById('start');const resetButton=document.getElementById('reset');let value=start;let timer;function render(){counter.textContent=value;status.textContent=value===end?\`Done — reached \${end}.\`:\`Counting down to \${end}…\`;startButton.disabled=Boolean(timer)||value===end}function stop(){window.clearInterval(timer);timer=undefined;render()}startButton.addEventListener('click',()=>{if(timer||value===end)return;timer=window.setInterval(()=>{value+=start>=end?-1:1;if(value===end)stop();else render()},90);render()});resetButton.addEventListener('click',()=>{window.clearInterval(timer);timer=undefined;value=start;status.textContent=\`Ready to count down to \${end}.\`;render()});render();\n`,
    };
  }
  if (/\bhello\s+world\b/i.test(userText)) {
    return {
      "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A Hello World page created by uncgpt.">
  <title>Hello World</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="shell">
    <section class="hero" aria-labelledby="title">
      <p class="eyebrow">A new GitHub Pages site</p>
      <h1 id="title">Hello, world<span>.</span></h1>
      <p class="lede">This page was created, committed, and published by uncgpt.</p>
      <button id="hello-button" type="button">Say hello</button>
      <p id="message" class="message" aria-live="polite">Ready when you are.</p>
    </section>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
      "style.css": `:root{color-scheme:dark;--bg:#090b12;--panel:#111827;--text:#f8fafc;--muted:#a5b4c8;--accent:#70f3c2}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;background:radial-gradient(circle at 78% 8%,#21365f 0,transparent 32%),var(--bg);color:var(--text);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}.shell{width:min(100% - 32px,760px)}.hero{padding:clamp(3rem,10vw,7rem);border:1px solid rgba(255,255,255,.13);border-radius:32px;background:linear-gradient(145deg,rgba(20,31,53,.92),rgba(10,14,25,.84));box-shadow:0 28px 90px rgba(0,0,0,.38)}.eyebrow{margin:0;color:var(--accent);font-size:.76rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.hero h1{margin:.4rem 0 1rem;font-size:clamp(3.5rem,12vw,7rem);line-height:.95;letter-spacing:-.075em}.hero h1 span{color:var(--accent)}.lede{max-width:32rem;color:var(--muted);font-size:clamp(1.05rem,2vw,1.25rem)}button{margin-top:1.4rem;border:0;border-radius:999px;padding:.8rem 1.2rem;background:var(--accent);color:#062017;font:inherit;font-weight:800;cursor:pointer;transition:transform .16s ease,filter .16s ease}button:hover{filter:brightness(1.05);transform:translateY(-2px)}button:focus-visible{outline:3px solid #fff;outline-offset:3px}.message{min-height:1.5em;margin:1.2rem 0 0;color:var(--muted)}@media(max-width:520px){.hero{padding:2.5rem 1.6rem;border-radius:25px}}\n`,
      "script.js": `const button=document.getElementById('hello-button');const message=document.getElementById('message');button?.addEventListener('click',()=>{message.textContent='Hello from your live GitHub Pages site.';});\n`,
    };
  }
  const titleMatch = userText.match(/\b(?:for|called|named)\s+["'“”]?([^"'“”\n]+?)(?:["'“”]|\s+in\s+|\s+with\s+|$)/i);
  const title = escapeTemplateHtml((titleMatch?.[1] || "Your Name").trim().slice(0, 80));
  const subtitle = "Designer, developer, and creative problem solver.";
  return {
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A modern personal portfolio website.">
  <title>${title} — Portfolio</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header"><a class="brand" href="#top">${title}</a><nav><a href="#work">Work</a><a href="#about">About</a><a href="#contact">Contact</a></nav></header>
  <main id="top">
    <section class="hero"><p class="eyebrow">Hello, I’m</p><h1>${title}<span>.</span></h1><p class="lede">${subtitle}</p><div class="actions"><a class="button primary" href="#work">View my work</a><a class="button" href="#contact">Let’s talk</a></div></section>
    <section id="work" class="section"><div class="section-heading"><p class="eyebrow">Selected work</p><h2>Ideas made useful.</h2></div><div class="work-grid"><article class="project"><div class="project-art gradient-one"></div><h3>Project One</h3><p>A thoughtful digital experience built around clarity and momentum.</p></article><article class="project"><div class="project-art gradient-two"></div><h3>Project Two</h3><p>A flexible visual system that makes complex things feel simple.</p></article><article class="project"><div class="project-art gradient-three"></div><h3>Project Three</h3><p>A responsive product that turns good ideas into real outcomes.</p></article></div></section>
    <section id="about" class="section split"><div><p class="eyebrow">About</p><h2>Curious by nature. Focused on the details.</h2></div><p>I combine strategy, design, and technology to create work that feels clear, useful, and distinctly human.</p></section>
    <section id="contact" class="contact-card"><p class="eyebrow">Have a project in mind?</p><h2>Let’s make something great.</h2><a class="button primary" href="mailto:hello@example.com">hello@example.com</a></section>
  </main>
  <footer><span>© <span id="year"></span> ${title}</span><a href="#top">Back to top ↑</a></footer>
  <script src="script.js"></script>
</body>
</html>
`,
    "style.css": `:root{--bg:#0b0d12;--panel:#121620;--text:#f5f7fb;--muted:#a7afc0;--line:rgba(255,255,255,.12);--accent:#9cf3d3}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 80% 0%,#1b263d 0,#0b0d12 35%);color:var(--text);font:16px/1.6 Inter,ui-sans-serif,system-ui,sans-serif}a{color:inherit;text-decoration:none}.site-header,main,footer{width:min(1120px,calc(100% - 40px));margin:auto}.site-header{display:flex;justify-content:space-between;align-items:center;padding:28px 0;border-bottom:1px solid var(--line)}.brand{font-weight:800;letter-spacing:-.03em}.site-header nav{display:flex;gap:26px;color:var(--muted);font-size:.95rem}.hero{padding:clamp(100px,16vw,190px) 0 140px;max-width:800px}.eyebrow{color:var(--accent);font-size:.76rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.hero h1{font-size:clamp(4rem,12vw,9rem);line-height:.95;letter-spacing:-.08em;margin:18px 0}.hero h1 span{color:var(--accent)}.lede{color:var(--muted);font-size:clamp(1.15rem,2vw,1.5rem);max-width:540px}.actions{display:flex;gap:12px;margin-top:32px;flex-wrap:wrap}.button{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:12px 20px;transition:.2s}.button:hover{transform:translateY(-2px);border-color:var(--accent)}.button.primary{background:var(--accent);color:#0b0d12;border-color:var(--accent);font-weight:800}.section{padding:90px 0;border-top:1px solid var(--line)}.section-heading{display:flex;justify-content:space-between;align-items:end;margin-bottom:32px}.section h2,.contact-card h2{font-size:clamp(2rem,5vw,4.4rem);line-height:1.05;letter-spacing:-.06em;margin:8px 0}.work-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.project{background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:14px}.project-art{aspect-ratio:1.35;border-radius:16px;margin-bottom:20px}.gradient-one{background:linear-gradient(135deg,#b4f8d9,#6075ff)}.gradient-two{background:linear-gradient(135deg,#ffca8b,#e85d9e)}.gradient-three{background:linear-gradient(135deg,#a0d9ff,#8b72ff)}.project h3,.project p{margin:0 10px 8px}.project p,.split>p{color:var(--muted)}.split{display:grid;grid-template-columns:1fr 1fr;gap:48px}.split>p{font-size:1.35rem;align-self:end}.contact-card{margin:90px 0;padding:clamp(32px,7vw,80px);border-radius:28px;background:linear-gradient(135deg,#1c2c3d,#172020);border:1px solid var(--line)}footer{display:flex;justify-content:space-between;padding:28px 0 50px;color:var(--muted);font-size:.9rem}@media(max-width:720px){.site-header nav{gap:12px}.work-grid,.split{grid-template-columns:1fr}.section-heading{display:block}.hero{padding-top:100px}.site-header,main,footer{width:min(100% - 28px,1120px)}}
`,
    "script.js": "document.getElementById('year').textContent = new Date().getFullYear();\n",
  };
}

function canonicalGithubPagesUrl(owner: string, repo: string, candidate?: unknown) {
  const fallback = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${encodeURIComponent(repo)}/`;
  const value = String(candidate || "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(value) || !/github\.io/i.test(value)) return fallback;
  return value.endsWith("/") ? value : `${value}/`;
}

async function probePublicUrl(url: string) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(5000) });
    return { ok: response.ok, statusCode: response.status };
  } catch {
    return { ok: false, statusCode: 0 };
  }
}

async function waitForGithubPages(getPages: () => Promise<any>, getBuild: () => Promise<any>, owner: string, repo: string, initialPages?: any) {
  let pages = initialPages || null;
  let build: any = null;
  let url = canonicalGithubPagesUrl(owner, repo, pages?.html_url || pages?.https_url || pages?.url);
  let status = String(pages?.status || "building").toLowerCase();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { pages = await getPages(); } catch {}
    try { build = await getBuild(); } catch {}
    url = canonicalGithubPagesUrl(owner, repo, pages?.html_url || pages?.https_url || pages?.url || url);
    status = String(build?.status || pages?.status || status || "building").toLowerCase();
    const probe = await probePublicUrl(url);
    if (probe.ok) return { url, status: status || "built", verified: true, httpStatus: probe.statusCode };
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return { url, status: status || "building", verified: false, httpStatus: 404 };
}

async function executeWebsiteScaffold(baseUrl: string, cookieHeader: string, owner: string, repo: string, userText: string, deployPages: boolean, deployVercel: boolean) {
  const files = buildPortfolioFiles(userText);
  const paths = Object.keys(files);
  let repository: any;
  let createdRepository = false;
  try {
    repository = await executeOAuthGithubAction(baseUrl, cookieHeader, "get_repo", { owner, repo });
  } catch (error) {
    if (!isMissingGithubRepositoryError(error)) throw error;
    repository = await executeOAuthGithubAction(baseUrl, cookieHeader, "create_repo", {
      name: repo,
      description: `Website created by uncgpt for ${owner}/${repo}`,
      private: false,
    });
    createdRepository = true;
  }
  const branch = String(repository?.default_branch || "main");
  for (const path of paths) {
    await executeOAuthGithubAction(baseUrl, cookieHeader, "create_or_update_file", {
      owner, repo, path, content: files[path as keyof typeof files], message: `Create portfolio website: ${path}`, branch,
    });
  }
  const result: any = { owner, repo, branch, createdRepository, repositoryUrl: repository?.html_url || `https://github.com/${owner}/${repo}`, files: paths };
  if (deployPages) {
    const pages = await executeOAuthGithubAction(baseUrl, cookieHeader, "enable_pages", { owner, repo, branch, path: "/", build_type: "legacy" });
    try { await executeOAuthGithubAction(baseUrl, cookieHeader, "build_pages", { owner, repo }); } catch (error) { console.warn("GitHub Pages build request failed after enable", error); }
    const readiness = await waitForGithubPages(
      () => executeOAuthGithubAction(baseUrl, cookieHeader, "get_pages", { owner, repo }),
      () => executeOAuthGithubAction(baseUrl, cookieHeader, "get_pages_build", { owner, repo }),
      owner,
      repo,
      pages,
    );
    result.githubPagesUrl = readiness.url;
    result.githubPagesStatus = readiness.status;
    result.githubPagesVerified = readiness.verified;
  }
  if (deployVercel) {
    try {
      await executeOAuthVercelAction(baseUrl, cookieHeader, "create_project", { name: repo, owner, repo });
    } catch (error) {
      if (!/already exists|project already|duplicate|409/i.test(String((error as any)?.message || error))) throw error;
    }
    const deployment = await executeOAuthVercelAction(baseUrl, cookieHeader, "create_deployment", { name: repo, owner, repo, branch, target: "production" });
    result.vercelUrl = deployment?.url ? (String(deployment.url).startsWith("http") ? deployment.url : `https://${deployment.url}`) : undefined;
    result.vercelState = deployment?.readyState || deployment?.state || "QUEUED";
  }
  return result;
}

function parseComposioObject(value: any) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function calendarEventCardPayload(value: any) {
  const root = parseComposioObject(value) || value || {};
  const responseData = parseComposioObject(root?.response_data) || root?.responseData || root?.data?.response_data || root?.data?.responseData || root?.data || root;
  const event = parseComposioObject(responseData) || responseData || {};
  const start = event?.start?.dateTime || event?.start_datetime || event?.start || root?.start_datetime || '';
  const end = event?.end?.dateTime || event?.end_datetime || event?.end || root?.end_datetime || '';
  const rawUrl = String(event?.htmlLink || event?.html_link || event?.webViewLink || event?.url || root?.htmlLink || root?.html_link || '').trim();
  return {
    title: String(event?.summary || event?.title || root?.summary || root?.title || 'Calendar event').slice(0, 160),
    start: String(start || '').slice(0, 80),
    end: String(end || '').slice(0, 80),
    eventId: String(event?.id || event?.event_id || root?.id || root?.event_id || '').slice(0, 160),
    url: /^https:\/\/[^\s]+$/i.test(rawUrl) ? rawUrl : 'https://calendar.google.com/calendar/u/0/r',
  };
}

function calendarEventResultCard(value: any) {
  return `[[UNCGPT_CALENDAR_EVENT:${JSON.stringify(calendarEventCardPayload(value))}]]`;
}

function parseDeterministicCalendarCreate(text: string, requestedTimeZone?: string) {
  const timezone = requestedTimeZone && (() => { try { Intl.DateTimeFormat('en-US', { timeZone: requestedTimeZone }); return true; } catch { return false; } })() ? requestedTimeZone : 'UTC';
  const explicitDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  let date = explicitDate;
  if (!date && /\btomorrow\b/i.test(text)) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
    const tomorrow = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + 1));
    date = tomorrow.toISOString().slice(0, 10);
  }
  const timeMatch = text.match(/\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  const title = text.match(/\b(?:called|named|titled)\s+["“”']?(.+?)["“”']?\s*$/i)?.[1]?.trim();
  if (!date || !timeMatch || !title) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const period = timeMatch[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  const durationMinutes = Number(text.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i)?.[1] || 60);
  return {
    summary: title.slice(0, 160),
    start_datetime: `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    timezone,
    event_duration_hour: Math.floor(durationMinutes / 60),
    event_duration_minutes: durationMinutes % 60,
    calendar_id: 'primary',
  };
}

async function executeVerifiedGoogleCalendarCreate(composioSession: any, args: Record<string, unknown>) {
  const result: any = await composioSession.execute('GOOGLECALENDAR_CREATE_EVENT', args);
  if (result?.error || result?.successful === false || result?.data?.error) {
    throw new Error(String(result?.error || result?.data?.error || 'Google Calendar did not confirm the event creation.'));
  }
  const created = calendarEventCardPayload(result?.data ?? result);
  if (!created.eventId) throw new Error('Google Calendar did not return an event ID, so the event could not be verified.');
  const verification: any = await composioSession.execute('GOOGLECALENDAR_EVENTS_GET', { event_id: created.eventId, calendar_id: 'primary' });
  if (verification?.error || verification?.successful === false || verification?.data?.error) {
    throw new Error(String(verification?.error || verification?.data?.error || 'Google Calendar did not confirm the created event.'));
  }
  const verified = calendarEventCardPayload(verification?.data ?? verification);
  if (!verified.eventId || verified.eventId !== created.eventId) throw new Error('Google Calendar could not verify the created event.');
  return calendarEventResultCard({ ...created, ...verified, url: verified.url || created.url });
}

function getComposioInputSchema(schema: any) {
  const candidates = [schema?.inputSchema, schema?.input_schema, schema?.inputParameters, schema?.input_parameters, schema?.parameters];
  for (const candidate of candidates) {
    const parsed = parseComposioObject(candidate);
    if (!parsed) continue;
    if (parsed.properties && typeof parsed.properties === "object") return { type: "object", ...parsed };
    if (parsed.input_parameters && typeof parsed.input_parameters === "object") return { type: "object", properties: parsed.input_parameters, required: parsed.required };
    if (parsed.fields && typeof parsed.fields === "object") return { type: "object", properties: parsed.fields, required: parsed.required };
    if (parsed.type === "object" || Object.keys(parsed).length > 0) return { type: "object", properties: parsed };
  }
  return null;
}

function normalizeComposioSearchSchemas(search: any) {
  const sources = [search?.toolSchemas, search?.tools, search?.results, search?.data?.toolSchemas, search?.data?.tools, search?.data?.results];
  const schemas: any[] = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const item of source) {
        if (item && typeof item === "object") schemas.push(item);
      }
    } else if (source && typeof source === "object") {
      for (const [key, item] of Object.entries(source)) {
        if (item && typeof item === "object") schemas.push({ ...(item as any), toolSlug: (item as any).toolSlug || (item as any).slug || key });
      }
    }
  }
  const unique = new Map<string, any>();
  for (const schema of schemas) {
    const toolSlug = String(schema?.toolSlug || schema?.slug || schema?.name || "").trim();
    const inputSchema = getComposioInputSchema(schema);
    if (toolSlug && inputSchema) unique.set(toolSlug, { ...schema, toolSlug, inputSchema });
  }
  return [...unique.values()];
}

function knownComposioGithubSchema(toolSlug: string) {
  const properties = toolSlug === "GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"
    ? { name: { type: "string" }, description: { type: "string" }, private: { type: "boolean" } }
    : toolSlug === "GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS"
      ? { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, content: { type: "string", description: "Base64 encoded file content." }, message: { type: "string" }, branch: { type: "string" } }
      : toolSlug === "GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE" || toolSlug === "GITHUB_CREATE_A_GITHUB_PAGES_SITE"
        ? { owner: { type: "string" }, repo: { type: "string" }, build_type: { type: "string" }, source_branch: { type: "string" } }
        : { owner: { type: "string" }, repo: { type: "string" } };
  return { toolSlug, inputSchema: { type: "object", properties } };
}

function composioSchemaArguments(schema: any, base: { owner: string; repo: string; name?: string; description?: string; private?: boolean; path?: string; content?: string; message?: string; branch?: string }) {
  const inputSchema = getComposioInputSchema(schema) || schema?.inputSchema || {};
  const properties = inputSchema?.properties && typeof inputSchema.properties === "object" ? inputSchema.properties : {};
  const required = Array.isArray(inputSchema?.required) ? inputSchema.required : [];
  const hasDeclaredProperties = Object.keys(properties).length > 0;
  const args: Record<string, unknown> = {};
  const put = (aliases: string[], value: unknown) => {
    const key = aliases.find((candidate) => properties[candidate]) || aliases.find((candidate) => required.includes(candidate));
    if (!key && hasDeclaredProperties) return;
    const finalKey = key || aliases[0];
    if (value !== undefined && value !== null && value !== "") args[finalKey] = value;
  };
  put(["owner", "owner_login", "username", "user"], base.owner);
  put(["repo", "repository", "repository_name", "repo_name", "repoName"], base.repo);
  put(["name", "repo_name", "repository_name", "repoName", "repositoryName"], base.name || base.repo);
  put(["description", "repo_description", "repository_description"], base.description);
  if (base.private !== undefined) {
    const visibilityProperty = ["private", "is_private", "visibility"].find((candidate) => properties[candidate]);
    if (visibilityProperty) args[visibilityProperty] = visibilityProperty === "visibility" ? (base.private ? "private" : "public") : base.private;
  }
  put(["path", "file_path", "filename", "file_name"], base.path);
  put(["branch", "branch_name", "ref", "source_branch"], base.branch || "main");
  put(["message", "commit_message", "commitMessage"], base.message);
  if (base.content !== undefined) {
    const contentAliases = ["content", "file_content", "contents", "text", "fileContent", "file_contents"];
    const contentProperty = contentAliases.find((candidate) => properties[candidate]) || contentAliases.find((candidate) => required.includes(candidate)) || "content";
    const description = String(properties[contentProperty]?.description || inputSchema?.description || "").toLowerCase();
    args[contentProperty] = description.includes("base64") ? Buffer.from(base.content, "utf8").toString("base64") : base.content;
  }
  return args;
}

async function executeComposioWebsiteScaffold(session: any, owner: string, repo: string, userText: string, deployPages: boolean) {
  const files = buildPortfolioFiles(userText);
  let search: any = null;
  try {
    search = await session.search({ query: "create GitHub repository, get repository, create or update repository files, enable GitHub Pages, and build Pages", toolkits: ["github"] });
  } catch (error) {
    console.warn("Composio GitHub tool search failed; using canonical slugs", error);
  }
  const schemas = normalizeComposioSearchSchemas(search);
  const descriptor = (schema: any) => `${schema?.toolSlug || ""} ${schema?.name || ""} ${schema?.displayName || ""} ${schema?.description || ""} ${schema?.humanDescription || ""}`.toLowerCase();
  const hasField = (schema: any, aliases: string[]) => {
    const inputSchema = getComposioInputSchema(schema);
    const properties = inputSchema?.properties && typeof inputSchema.properties === "object" ? inputSchema.properties : {};
    const required = Array.isArray(inputSchema?.required) ? inputSchema.required : [];
    return aliases.some((alias) => Boolean(properties[alias]) || required.includes(alias));
  };
  const fileSchema = schemas.find((schema) => /(?:create|update|write|upload).*(?:file|content)|(?:file|content).*(?:create|update|write|upload)/.test(descriptor(schema)) && !/list|search|get|read|delete/.test(descriptor(schema)) && hasField(schema, ["content", "file_content", "contents", "text", "fileContent", "file_contents"])) || knownComposioGithubSchema("GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS");
  const getRepoSchema = schemas.find((schema) => /(?:get|retrieve|fetch|inspect).*(?:repo|repository)|(?:repo|repository).*(?:get|retrieve|fetch|inspect)/.test(descriptor(schema)) && !/list|search/.test(descriptor(schema)));
  const createRepoSchema = schemas.find((schema) => /(?:create|make|new).*(?:repo|repository)|(?:repo|repository).*(?:create|make|new)/.test(descriptor(schema)) && !/file|issue|pull|branch/.test(descriptor(schema))) || knownComposioGithubSchema("GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER");
  let repository: any = null;
  let createdRepository = false;
  let branch = "main";
  if (getRepoSchema) {
    try {
      repository = await session.execute(getRepoSchema.toolSlug, composioSchemaArguments(getRepoSchema, { owner, repo }));
      repository = repository?.data ?? repository;
    } catch (error) {
      if (!isMissingGithubRepositoryError(error)) console.warn("Composio GitHub repository preflight failed; file write will determine availability", error);
    }
  }
  branch = String(repository?.default_branch || repository?.defaultBranch || "main");
  for (const path of Object.keys(files)) {
    const fileArguments = () => composioSchemaArguments(fileSchema, { owner, repo, path, content: files[path as keyof typeof files], message: `Create portfolio website: ${path}`, branch });
    let response: any = null;
    let executionError: unknown = null;
    try {
      response = await session.execute(fileSchema.toolSlug, fileArguments());
    } catch (error) {
      executionError = error;
    }
    const failed = executionError || response?.error || response?.successful === false || response?.data?.error;
    if (failed) {
      if (isMissingGithubRepositoryError(executionError || response || response?.data) && createRepoSchema && !createdRepository) {
        const created = await session.execute(createRepoSchema.toolSlug, composioSchemaArguments(createRepoSchema, { owner, repo, name: repo, description: `Website created by uncgpt for ${owner}/${repo}`, private: false }));
        if (created?.error || created?.successful === false || created?.data?.error) throw new Error(String(created?.error || created?.data?.error || `GitHub did not confirm repository creation.`));
        createdRepository = true;
        repository = created?.data ?? created;
        branch = String(repository?.default_branch || repository?.defaultBranch || "main");
        const retry = await session.execute(fileSchema.toolSlug, fileArguments());
        if (retry?.error || retry?.successful === false || retry?.data?.error) throw new Error(String(retry?.error || retry?.data?.error || `GitHub did not confirm writing ${path}.`));
      } else {
        throw new Error(String((executionError as any)?.message || response?.error || response?.data?.error || `GitHub did not confirm writing ${path}.`));
      }
    }
  }
  const result: any = { owner, repo, branch, createdRepository, repositoryUrl: repository?.html_url || repository?.htmlUrl || `https://github.com/${owner}/${repo}`, files: Object.keys(files) };
  if (deployPages) {
    const pageSchema = schemas.find((schema) => /(?:enable|create|configure|setup).*(?:page|pages)|(?:page|pages).*(?:enable|create|configure|setup)/.test(descriptor(schema)) && !/list|search|get|build/.test(descriptor(schema))) || knownComposioGithubSchema("GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE");
    const buildSchema = schemas.find((schema) => /(?:build|publish|deploy|request).*(?:page|pages)|(?:page|pages).*(?:build|publish|deploy)/.test(descriptor(schema))) || knownComposioGithubSchema("GITHUB_REQUEST_A_GITHUB_PAGES_BUILD");
    const pageResponse = await session.execute(pageSchema.toolSlug, composioSchemaArguments(pageSchema, { owner, repo, branch }));
    if (pageResponse?.error || pageResponse?.successful === false || pageResponse?.data?.error) throw new Error(String(pageResponse?.error || pageResponse?.data?.error || "GitHub Pages was not enabled."));
    const buildResponse = await session.execute(buildSchema.toolSlug, composioSchemaArguments(buildSchema, { owner, repo, branch }));
    if (buildResponse?.error || buildResponse?.successful === false || buildResponse?.data?.error) throw new Error(String(buildResponse?.error || buildResponse?.data?.error || "GitHub Pages build was not confirmed."));
    const readiness = await waitForGithubPages(
      async () => ({}),
      async () => ({}),
      owner,
      repo,
      { url: canonicalGithubPagesUrl(owner, repo) },
    );
    result.githubPagesUrl = readiness.url;
    result.githubPagesStatus = readiness.status;
    result.githubPagesVerified = readiness.verified;
  }
  return result;
}

function connectorPermissionResponse(toolkit: string, label: string, description: string, iconUrl: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: label, model: "connector-permission" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: { toolkit, label, description, iconUrl, mode: "connect" } })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `Connect ${label} to continue.` })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return createStreamResponse(stream, label, "connector-permission", []);
}

function directTextResponse(content: string, provider: string, model = "connected-action") {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return createStreamResponse(stream, provider, model, []);
}

// ============================================================
// TOOL LOOP WITH BUILTIN TOOLS
// ============================================================
// Connector actions are executed only by the verified tool loop below. No synthetic
// assistant messages are injected into model context.

async function planToolCalls(messages: any[], tools: any[]) {
  const body = {
    model: OPENAI_CHAT_MODEL,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
    temperature: 0.15,
    max_tokens: 2048,
  };

  if (OPENAI_KEY) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`OpenAI tool planning failed (${response.status})`);
    const data = await response.json();
    return data.choices?.[0]?.message || null;
  }

  const key = GROQ_KEYS[currentGroqKeyIndex % GROQ_KEYS.length];
  if (!key) throw new Error("No capable tool-planning provider is configured");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Groq tool planning failed (${response.status})`);
  const data = await response.json();
  return data.choices?.[0]?.message || null;
}

async function runToolLoop(
  messages: any[],
  tools: any[],
  baseUrl: string,
  onStep: (step: {
    iteration: number;
    action: "tool_use";
    tool: string;
    input: any;
    result: string;
  }) => void
): Promise<any[]> {
  if (tools.length === 0) return messages;

  let working = [...messages];

  const executedCalls = new Set<string>();
  for (let step = 1; step <= 6; step++) {
    let msg: any;
    try {
      msg = await planToolCalls(working, tools);
    } catch (error: any) {
      working.push({ role: "system", content: `Tool planning failed; do not claim that any external action succeeded. (${error?.message || "provider unavailable"})` });
      return working;
    }
    if (!msg) return working;

    working.push(msg);

    if (!msg.tool_calls?.length) return working;

    for (const tc of msg.tool_calls) {
      let args: any;
      try {
        args = JSON.parse(tc.function.arguments || "{}");
        if (!args || Array.isArray(args) || typeof args !== "object") throw new Error("arguments must be an object");
      } catch {
        const result = "Tool error: the model supplied malformed JSON arguments; the tool was not run.";
        onStep({ iteration: step, action: "tool_use", tool: tc.function.name, input: {}, result });
        working.push({ role: "tool", tool_call_id: tc.id, content: result });
        continue;
      }

      const callKey = `${tc.function.name}:${JSON.stringify(args)}`;
      if (executedCalls.has(callKey)) {
        const result = "Tool error: duplicate call skipped to avoid repeating an external action.";
        onStep({ iteration: step, action: "tool_use", tool: tc.function.name, input: args, result });
        working.push({ role: "tool", tool_call_id: tc.id, content: result });
        continue;
      }
      executedCalls.add(callKey);

      let result = "";
      const builtIn = tools.find(
        (t: any) =>
          t.function?.name === tc.function.name && !t._connector && !t._toolName && !t._exec
      );
      const mcp = tools.find((m: any) => m.function?.name === tc.function.name && m._connector);
      const executable = tools.find((o: any) => o.function?.name === tc.function.name && typeof o._exec === "function");

      if (builtIn) {
        try {
          result = await executeBuiltInTool(tc.function.name, args);
        } catch (e: any) {
          result = `Tool error: ${e.message}`;
        }
      } else if (executable) {
        try {
          result = await executable._exec(args);
        } catch (e: any) {
          result = `Tool error: ${e.message}`;
        }
      } else if (mcp) {
        try {
          result = await executeMcpTool(mcp, args, baseUrl);
        } catch (e: any) {
          result = `Tool error: ${e.message}`;
        }
      }

      onStep({
        iteration: step,
        action: "tool_use",
        tool: tc.function.name,
        input: args,
        result,
      });

      working.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 8000) });
    }
  }

  return working;
}

const UNVERIFIED_GITHUB_RESULT = "__UNVERIFIED_GITHUB_RESULT__";
const NO_GITHUB_ACCOUNT = "__NO_GITHUB_ACCOUNT__";

function formatGithubRepositories(value: unknown): string {
  let parsed: any = value;
  if (typeof parsed === "string") {
    if (parsed.trim().startsWith("- ")) return parsed.trim();
    try { parsed = JSON.parse(parsed); } catch { return UNVERIFIED_GITHUB_RESULT; }
  }

  const candidates: any[] = [];
  const visit = (item: any, depth = 0) => {
    if (!item || depth > 4) return;
    if (Array.isArray(item)) {
      if (item.some((entry) => entry && (entry.name || entry.full_name || entry.html_url))) candidates.push(...item);
      return;
    }
    if (typeof item === "object") Object.values(item).forEach((child) => visit(child, depth + 1));
  };
  visit(parsed);

  const rows = candidates
    .map((repo: any) => {
      const name = repo.full_name || repo.name;
      if (!name) return "";
      const url = repo.html_url || repo.url || "";
      return `- ${name}${url && !String(url).startsWith("http") ? "" : url ? ` — ${url}` : ""}`;
    })
    .filter(Boolean);

  return rows.length ? rows.join("\n") : UNVERIFIED_GITHUB_RESULT;
}

async function executeVerifiedGithubRepositories(userId: string, connectedAccountId?: string): Promise<string> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return NO_GITHUB_ACCOUNT;
  const effectiveUserId = userId || getComposioUserId('');

  try {
    const composio = new Composio({ apiKey });
    let accountId = connectedAccountId;
    if (!accountId) {
      const accounts: any = await composio.connectedAccounts.list({ userIds: getComposioUserIds(effectiveUserId), toolkitSlugs: ['github'], limit: 1000 });
      const account = (accounts?.items || []).find((item: any) => !item?.isDisabled && String(item?.status || '').toLowerCase() === 'active');
      accountId = account?.id;
    }
    if (!accountId) return NO_GITHUB_ACCOUNT;

    const toolSlugs = ['GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'];
    for (const slug of toolSlugs) {
      try {
        const response: any = await composio.tools.execute(slug, {
          userId: getComposioUserId(effectiveUserId),
          connectedAccountId: accountId,
          arguments: slug === 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER' ? { per_page: 100, sort: 'updated', direction: 'desc' } : {},
          dangerouslySkipVersionCheck: true,
        }, { signal: AbortSignal.timeout(15000) });
        if (response?.successful === false || response?.error) continue;
        const formatted = formatGithubRepositories(response?.data ?? response);
        if (formatted !== UNVERIFIED_GITHUB_RESULT) return formatted;
      } catch {}
    }
  } catch (error) {
    console.error('Verified GitHub execution failed:', error);
  }

  return UNVERIFIED_GITHUB_RESULT;
}

type DiscordReadIntent = "user" | "tag" | "servers" | "channels" | "avatar" | "banner";

function detectDiscordReadIntent(text: string): DiscordReadIntent | null {
  const value = text.toLowerCase();
  const mentionsDiscord = /\bdiscord\b/.test(value);
  const asksForImage = /\b(banner|cover photo|cover image|avatar|profile photo|profile picture|profile pic|pfp|photo|picture|puxture)\b/.test(value);
  const asksForProfileField = /\b(my|mine|your)\s+(tag|username|user id|userid|display name|discord tag|account|email)\b|\b(tag|discriminator)\b/.test(value);
  if (!mentionsDiscord && !asksForImage && !asksForProfileField) return null;
  if (/\b(banner|cover photo|cover image)\b/.test(value)) return "banner";
  if (/\b(avatar|profile photo|profile picture|profile pic|pfp|photo|picture|puxture)\b/.test(value)) return "avatar";
  if (/\b(tag|discriminator)\b/.test(value) || /\b(my|mine|your)\s+(discord\s+)?username\b/.test(value)) return "tag";
  if (/\b(channel|channels)\b/.test(value)) return "channels";
  if (/\b(server|servers|guild|guilds|membership|memberships)\b/.test(value)) return "servers";
  if (/\b(my|mine|user|username|profile|account|who am i|user id|userid)\b/.test(value)) return "user";
  return null;
}

function formatVerifiedConnectorData(value: unknown): string {
  return normalizeConnectorResult(value, "connector");
}

async function executeVerifiedDiscordRead(
  userId: string,
  intent: DiscordReadIntent
): Promise<string> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !userId) return NO_GITHUB_ACCOUNT;

  try {
    const composio = new Composio({ apiKey });
    const accounts: any = await composio.connectedAccounts.list({
      userIds: getComposioUserIds(userId),
      toolkitSlugs: ["discord"],
      limit: 1000,
    });
    const account = (accounts?.items || []).find((item: any) =>
      !item?.isDisabled && ["active", "connected"].includes(String(item?.status || "").toLowerCase())
    );
    if (!account?.id) return NO_GITHUB_ACCOUNT;

    const rawTools: any[] = await composio.tools.getRawComposioTools(
      { toolkits: ["discord"], limit: 250, important: false },
      undefined,
      { signal: AbortSignal.timeout(10000) }
    );

    const toolIntent: "user" | "servers" | "channels" = intent === "avatar" || intent === "banner" || intent === "tag" ? "user" : intent;
    const intentPatterns: Record<"user" | "servers" | "channels", RegExp[]> = {
      user: [/(current|authenticated|my).*user/i, /user.*(info|profile|details)/i, /get.*user/i, /who.*am.*i/i, /(?:my|your).*?(tag|username|discriminator)/i, /tag|discriminator|username/i],
      servers: [/(list|show|get|fetch).*?(server|guild)/i, /(server|guild).*(list|membership)/i, /my.*(server|guild)/i],
      channels: [/(list|show|get|fetch).*channel/i, /channel.*(list|info)/i],
    };
    const candidates = rawTools
      .filter((tool: any) => {
        const descriptor = `${tool?.slug || ""} ${tool?.name || ""} ${tool?.description || ""}`;
        return intentPatterns[toolIntent].some((pattern) => pattern.test(descriptor));
      })
      .sort((left: any, right: any) => {
        const score = (tool: any) => {
          const descriptor = `${tool?.slug || ""} ${tool?.name || ""} ${tool?.description || ""}`.toLowerCase();
          let value = 0;
          if (toolIntent === "user" && /(?:current|authenticated|self|me).*user|user.*(?:current|authenticated|self|me)/.test(descriptor)) value += 100;
          if (toolIntent === "user" && /profile|identity|account/.test(descriptor)) value += 40;
          if (/application|oauth|connection|integration/.test(descriptor)) value -= 120;
          if (toolIntent === "user" && /bot/.test(descriptor)) value -= 100;
          if (toolIntent === "servers" && /server|guild/.test(descriptor)) value += 40;
          if (toolIntent === "channels" && /channel/.test(descriptor)) value += 40;
          return value;
        };
        return score(right) - score(left);
      });

    const formatDiscordProfile = (value: unknown, requestedIntent: DiscordReadIntent = "user"): string | null => {
      const seen = new Set<any>();
      const visit = (item: any, depth = 0): any => {
        if (!item || depth > 6 || typeof item !== "object" || seen.has(item)) return null;
        seen.add(item);
        if (Array.isArray(item)) {
          for (const entry of item) {
            const match = visit(entry, depth + 1);
            if (match) return match;
          }
          return null;
        }
        const username = item.username || item.user_name;
        const id = item.id || item.user_id || item.userId;
        const looksLikeBotApplication = Boolean(
          item.application ||
          item.oauth2_install_params ||
          item.integration_types_config ||
          item.storefront_available !== undefined ||
          item.bot === true ||
          item.bot_public !== undefined ||
          item.bot_require_code_grant !== undefined
        );
        if (username && id && !looksLikeBotApplication) return item;
        for (const child of Object.values(item)) {
          const match = visit(child, depth + 1);
          if (match) return match;
        }
        return null;
      };

      const profile = visit(value);
      if (!profile) return null;

      const findField = (item: any, keys: string[], depth = 0, seenFields = new Set<any>()): unknown => {
        if (!item || depth > 8 || typeof item !== "object" || seenFields.has(item)) return undefined;
        seenFields.add(item);
        if (Array.isArray(item)) {
          for (const entry of item) {
            const found = findField(entry, keys, depth + 1, seenFields);
            if (found !== undefined && found !== null && String(found).trim() !== "") return found;
          }
          return undefined;
        }
        for (const key of keys) {
          const found = item[key];
          if (found !== undefined && found !== null && String(found).trim() !== "") return found;
        }
        for (const child of Object.values(item)) {
          const found = findField(child, keys, depth + 1, seenFields);
          if (found !== undefined && found !== null && String(found).trim() !== "") return found;
        }
        return undefined;
      };

      const username = profile.username || profile.user_name || findField(value, ["username", "user_name"]);
      const rawDiscriminator = profile.discriminator ?? findField(value, ["discriminator", "user_discriminator", "userDiscriminator"]);
      const discriminator = rawDiscriminator && String(rawDiscriminator) !== "0" ? String(rawDiscriminator) : "";
      const primaryGuild = profile.primary_guild || profile.primaryGuild || findField(value, ["primary_guild", "primaryGuild"]);
      const primaryGuildTag = primaryGuild && typeof primaryGuild === "object"
        ? (primaryGuild as any).tag || (primaryGuild as any).server_tag || (primaryGuild as any).serverTag
        : undefined;
      const primaryGuildBadge = primaryGuild && typeof primaryGuild === "object"
        ? (primaryGuild as any).badge || (primaryGuild as any).badge_hash || (primaryGuild as any).badgeHash
        : undefined;
      const relatedGuild = findField(value, ["guild", "server"]);
      const primaryGuildName = primaryGuild && typeof primaryGuild === "object"
        ? (primaryGuild as any).name || (primaryGuild as any).guild_name || (primaryGuild as any).guildName || (primaryGuild as any).server_name || (primaryGuild as any).serverName
        : undefined;
      const relatedGuildName = relatedGuild && typeof relatedGuild === "object"
        ? (relatedGuild as any).name || (relatedGuild as any).guild_name || (relatedGuild as any).guildName || (relatedGuild as any).server_name || (relatedGuild as any).serverName
        : findField(value, ["guild_name", "guildName", "server_name", "serverName"]);
      if (requestedIntent === "tag") {
        const explicitTag = primaryGuildTag || profile.tag || profile.user_tag || profile.userTag || profile.discord_tag || profile.discordTag || findField(value, ["tag", "user_tag", "userTag", "discord_tag", "discordTag"]);
        const legacyTag = username && discriminator ? `${username}#${discriminator}` : "";
        const tag = explicitTag || legacyTag;
        if (!tag) return "[[DISCORD_NO_TAG]]";
        const cleanTag = primaryGuildTag
          ? String(tag).replace(/\s+/g, "").slice(0, 4)
          : String(tag).trim();
        const payload = JSON.stringify({
          tag: cleanTag,
          kind: primaryGuildTag ? "server" : "account",
          badge: primaryGuildBadge ? String(primaryGuildBadge) : "",
          guildId: primaryGuild && typeof primaryGuild === "object" ? String((primaryGuild as any).identity_guild_id || (primaryGuild as any).identityGuildId || "") : "",
          serverName: primaryGuildName || relatedGuildName ? String(primaryGuildName || relatedGuildName).trim() : "",
        });
        return `[[DISCORD_TAG:${encodeURIComponent(payload)}]]`;
      }
      const imageHash = requestedIntent === "avatar" ? profile.avatar : requestedIntent === "banner" ? profile.banner : null;
      if (requestedIntent === "avatar" || requestedIntent === "banner") {
        const profileId = profile.id || profile.user_id || profile.userId;
        if (!profileId || !imageHash) return null;
        const hash = String(imageHash);
        const imageUrl = /^https?:\/\//i.test(hash)
          ? hash
          : `https://cdn.discordapp.com/${requestedIntent === "avatar" ? "avatars" : "banners"}/${profileId}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=1024`;
        const label = requestedIntent === "avatar" ? "avatar" : "banner";
        return `![Discord ${label}](${imageUrl})`;
      }

      const lines: string[] = [];
      const add = (label: string, field: unknown, format?: (value: any) => string) => {
        if (field === undefined || field === null || field === "") return;
        lines.push(`${label}: ${format ? format(field) : String(field)}`);
      };
      const yesNo = (field: unknown) => field ? "Yes" : "No";
      const available = (field: unknown) => field ? "Available" : "Not set";

      add("Username", profile.username || profile.user_name);
      add("Display name", profile.global_name || profile.display_name);
      add("User ID", profile.id || profile.user_id || profile.userId);
      if (profile.tag) {
        add("Tag", profile.tag);
      } else if (profile.discriminator && String(profile.discriminator) !== "0") {
        add("Tag", `${profile.username || profile.user_name}#${profile.discriminator}`);
      }
      add("Email", profile.email);
      add("Verified", profile.verified, yesNo);
      add("MFA enabled", profile.mfa_enabled, yesNo);
      add("Locale", profile.locale);
      add("Avatar", profile.avatar, available);
      add("Avatar decoration", profile.avatar_decoration_data, available);
      add("Banner", profile.banner, available);
      add("Accent color", profile.accent_color || profile.banner_color);
      add("Premium type", profile.premium_type);
      add("Public flags", profile.public_flags);
      add("Account flags", profile.flags);
      add("Bot account", profile.bot, yesNo);
      add("System account", profile.system, yesNo);
      return lines.length ? lines.join("\n") : null;
    };

    for (const tool of candidates.slice(0, 8)) {
      const required = tool?.inputParameters?.required || tool?.input_parameters?.required || [];
      if (Array.isArray(required) && required.length > 0) continue;
      try {
        const response: any = await composio.tools.execute(
          tool.slug,
          {
            userId: getComposioUserId(userId),
            connectedAccountId: account.id,
            arguments: {},
            dangerouslySkipVersionCheck: true,
          },
          { signal: AbortSignal.timeout(15000) }
        );
        if (response?.successful === false || response?.error) continue;
        const rawResult = response?.data ?? response;
        if (intent === "user" || intent === "tag" || intent === "avatar" || intent === "banner") {
          const identity = formatDiscordProfile(rawResult, intent);
          if (identity) return identity;
          continue;
        }
        return formatVerifiedConnectorData(rawResult);
      } catch {}
    }
    return UNVERIFIED_GITHUB_RESULT;
  } catch (error) {
    console.error("Verified Discord execution failed:", error);
    return UNVERIFIED_GITHUB_RESULT;
  }
}

function buildOAuthTools(req: NextRequest, baseUrl: string) {
  const cookieHeader = req.headers.get("cookie") || "";
  const providers = [
    "github",
    "linear",
    "slack",
    "notion",
    "google_drive",
    "vercel",
  ];
  const connected = providers.filter((p) =>
    cookieHeader.includes(`mcp_oauth_${p}=`)
  );

  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "check_connections",
        description:
          "Check which third-party services are connected. Call this FIRST before any GitHub/Slack/etc action.",
        parameters: { type: "object", properties: {} },
      },
      _exec: async () =>
        JSON.stringify({
          connected,
          available: providers,
          hint:
            connected.length === 0
              ? "No services connected. User must click Settings -> Connectors and link the service first."
              : `Connected: ${connected.join(", ")}.`,
        }),
    },
  ];

  if (connected.includes("github")) {
    const callGh = async (action: string, params: any) => {
      const res = await fetch(`${baseUrl}/api/mcp/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ action, ...params }),
      });
      const data = await res.json();
      if (!res.ok) return `GitHub error: ${data.error || res.status}`;
      return JSON.stringify(data.data ?? data);
    };

    tools.push(
      {
        type: "function",
        function: {
          name: "github_whoami",
          description: "Get the authenticated GitHub user.",
          parameters: { type: "object", properties: {} },
        },
        _exec: async () => {
          const res = await fetch(`${baseUrl}/api/mcp/github`, {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: cookieHeader },
            body: JSON.stringify({ action: "list_repos" }),
          });
          const data = await res.json();
          if (!res.ok) return `GitHub error: ${data.error}`;
          const owner = data.data?.[0]?.owner?.login || "unknown";
          return JSON.stringify({
            login: owner,
            repo_count: data.data?.length || 0,
          });
        },
      },
      {
        type: "function",
        function: {
          name: "github_list_repos",
          description: "List the authenticated user's GitHub repositories.",
          parameters: { type: "object", properties: {} },
        },
        _exec: async () => callGh("list_repos", {}),
      },
      {
        type: "function",
        function: {
          name: "github_create_repo",
          description: "Create a new GitHub repository.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              private: { type: "boolean" },
            },
            required: ["name"],
          },
        },
        _exec: async (args: any) => callGh("create_repo", args),
      },
      {
        type: "function",
        function: {
          name: "github_push_file",
          description: "Create or update a file in a GitHub repo.",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              path: { type: "string" },
              content: { type: "string" },
              message: { type: "string" },
              branch: { type: "string" },
            },
            required: ["owner", "repo", "path", "content", "message"],
          },
        },
        _exec: async (args: any) => callGh("create_or_update_file", args),
      },
      {
        type: "function",
        function: {
          name: "github_create_issue",
          description: "Open an issue on a GitHub repo.",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
            },
            required: ["owner", "repo", "title"],
          },
        },
        _exec: async (args: any) => callGh("create_issue", args),
      }
    );
  }

  if (connected.includes("github")) {
    tools.push(
      {
        type: "function",
        function: {
          name: "github_get_user",
          description: "Get the authenticated GitHub account, including its login. Use this when the user says my repository and does not provide an owner.",
          parameters: { type: "object", properties: {} },
        },
        _exec: async () => callGh("get_user", {}),
      },
      {
        type: "function",
        function: {
          name: "github_get_file",
          description: "Read an existing file from a GitHub repository before editing it.",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              path: { type: "string" },
              ref: { type: "string" },
            },
            required: ["owner", "repo", "path"],
          },
        },
        _exec: async (args: any) => callGh("get_file", args),
      },
      {
        type: "function",
        function: {
          name: "github_delete_file",
          description: "Delete a file from a GitHub repository. Use only when the user explicitly asks to delete it.",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              path: { type: "string" },
              message: { type: "string" },
              branch: { type: "string" },
              sha: { type: "string" },
            },
            required: ["owner", "repo", "path"],
          },
        },
        _exec: async (args: any) => callGh("delete_file", args),
      },
      {
        type: "function",
        function: {
          name: "github_enable_pages",
          description: "Enable or update GitHub Pages for a repository using the main branch or docs directory.",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              branch: { type: "string" },
              path: { type: "string", enum: ["/", "/docs"] },
              build_type: { type: "string", enum: ["legacy", "workflow"] },
            },
            required: ["owner", "repo"],
          },
        },
        _exec: async (args: any) => callGh("enable_pages", args),
      },
      {
        type: "function",
        function: {
          name: "github_build_pages",
          description: "Request a fresh GitHub Pages build after website files have been committed.",
          parameters: {
            type: "object",
            properties: { owner: { type: "string" }, repo: { type: "string" } },
            required: ["owner", "repo"],
          },
        },
        _exec: async (args: any) => callGh("build_pages", args),
      },
      {
        type: "function",
        function: {
          name: "github_get_pages",
          description: "Get the GitHub Pages URL, source branch, and current site status for a repository.",
          parameters: {
            type: "object",
            properties: { owner: { type: "string" }, repo: { type: "string" } },
            required: ["owner", "repo"],
          },
        },
        _exec: async (args: any) => callGh("get_pages", args),
      },
      {
        type: "function",
        function: {
          name: "github_get_pages_build",
          description: "Get the latest GitHub Pages build status and any build error.",
          parameters: {
            type: "object",
            properties: { owner: { type: "string" }, repo: { type: "string" } },
            required: ["owner", "repo"],
          },
        },
        _exec: async (args: any) => callGh("get_pages_build", args),
      }
    );
  }

  if (connected.includes("vercel")) {
    const callVercel = async (action: string, params: any) => {
      const res = await fetch(`${baseUrl}/api/mcp/vercel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ action, ...params }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return `Vercel error: ${data.error || res.status}`;
      return JSON.stringify(data.data ?? data);
    };

    tools.push(
      {
        type: "function",
        function: {
          name: "vercel_list_projects",
          description: "List Vercel projects available to the connected account.",
          parameters: { type: "object", properties: { limit: { type: "number" } } },
        },
        _exec: async (args: any) => callVercel("list_projects", args),
      },
      {
        type: "function",
        function: {
          name: "vercel_create_project",
          description: "Create a Vercel project and optionally connect it to a GitHub repository.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              owner: { type: "string" },
              repo: { type: "string" },
              framework: { type: "string" },
            },
            required: ["name"],
          },
        },
        _exec: async (args: any) => callVercel("create_project", args),
      },
      {
        type: "function",
        function: {
          name: "vercel_deploy_github",
          description: "Deploy a committed GitHub repository to Vercel. Use after the requested files exist in GitHub.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              owner: { type: "string" },
              repo: { type: "string" },
              branch: { type: "string" },
              projectId: { type: "string" },
              target: { type: "string", enum: ["production", "preview"] },
              repoId: { type: "string" },
            },
            required: ["owner", "repo"],
          },
        },
        _exec: async (args: any) => callVercel("create_deployment", args),
      },
      {
        type: "function",
        function: {
          name: "vercel_list_deployments",
          description: "List recent Vercel deployments and their current status.",
          parameters: { type: "object", properties: { projectId: { type: "string" }, limit: { type: "number" } } },
        },
        _exec: async (args: any) => callVercel("list_deployments", args),
      },
      {
        type: "function",
        function: {
          name: "vercel_get_deployment",
          description: "Get the status and URL of a specific Vercel deployment.",
          parameters: { type: "object", properties: { deploymentId: { type: "string" } }, required: ["deploymentId"] },
        },
        _exec: async (args: any) => callVercel("get_deployment", args),
      }
    );
  }

  return { tools, connected, available: providers };
}

// ============================================================
// STREAM RESPONSE
// ============================================================
function createStreamResponse(
  stream: ReadableStream,
  provider: string,
  model: string,
  toolSteps: Array<{
    iteration: number;
    action: "tool_use";
    tool: string;
    input: any;
    result: string;
  }> = []
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const s = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider, model })}\n\n`));

      for (const step of toolSteps) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ tool_step: step })}\n\n`)
        );
      }

      const reader = stream.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") continue;

              try {
                const data = JSON.parse(dataStr);
                if (data.permission_request) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: data.permission_request })}\n\n`));
                }
                let content =
                  data.choices?.[0]?.delta?.content || "";
                if (!content && data.response) content = data.response;
                if (!content && data.content) content = data.content;
                if (!content && typeof data === "string") content = data;

                if (content) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content })}\n\n`
                    )
                  );
                }
              } catch (e) {
                const rawContent = trimmed.slice(6);
                if (rawContent) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content: rawContent })}\n\n`
                    )
                  );
                }
              }
            } else if (!trimmed.startsWith("event:")) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ content: trimmed })}\n\n`
                )
              );
            }
          }
        }
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err?.message || "The response stream ended unexpectedly." })}\n\n`));
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(s, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ============================================================
// MAIN HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages = [],
      model,
      provider,
      preferredModel,
      preferredProvider,
      projectInstructions,
      projectMemory,
      source,
      mcpConnectors,
      webSearch,
      computerUse,
      clientTimeZone,
      clientLocale,
      clientCountry,
      clientCountryCode,
    } = body;

    // The replacement release exposes one model only; old client model values are ignored.
    const finalModel = "uncgpt";
    const finalProvider = "auto";

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    const lastMsg = messages[messages.length - 1];
    const recentConversationText = messages.slice(-8).map((message: any) => Array.isArray(message?.content) ? message.content.find((content: any) => content.type === "text")?.text || "" : String(message?.content || "")).join("\n");
    const recentUserText = messages.filter((message: any) => message?.role === 'user').slice(-5).map((message: any) => Array.isArray(message?.content) ? message.content.find((content: any) => content.type === 'text')?.text || '' : String(message?.content || '')).join('\n');
    const userText = Array.isArray(lastMsg?.content)
      ? lastMsg.content.find((c: any) => c.type === "text")?.text || ""
      : lastMsg?.content || "";

    // ==================== FAST CONNECTOR READS ====================
    // Handle direct Discord reads before memory/search/tool discovery. Those steps can
    // be slow and must never prevent a connected-account request from replying.
    const earlyDiscordReadIntent = detectDiscordReadIntent(userText);
    if (earlyDiscordReadIntent) {
      let reply = "Discord isn’t connected yet. Open Settings → Connectors and connect Discord.";
      let shouldShowPermission = true;
      try {
        const session = await getSession();
        const resultText = await executeVerifiedDiscordRead(session?.user?.sub || "", earlyDiscordReadIntent);
        if (resultText !== NO_GITHUB_ACCOUNT && resultText !== UNVERIFIED_GITHUB_RESULT) {
          const heading = earlyDiscordReadIntent === "avatar" ? "Here is your Discord avatar:" : earlyDiscordReadIntent === "banner" ? "Here is your Discord banner:" : earlyDiscordReadIntent === "tag" ? "Here is your verified Discord tag:" : earlyDiscordReadIntent === "user" ? "Here is your verified Discord account information:" : earlyDiscordReadIntent === "servers" ? "Here are your verified Discord servers:" : "Here are your verified Discord channels:";
          reply = `${heading}\n\n${resultText}`;
          shouldShowPermission = false;
        } else if (resultText === UNVERIFIED_GITHUB_RESULT) {
          reply = "Discord is connected, but it did not return verifiable data for that request.";
          shouldShowPermission = false;
        }
      } catch {
        reply = "I couldn’t access the connected Discord account right now. Please try again.";
        shouldShowPermission = false;
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: "Discord", model: "connected-action" })}\n\n`));
          if (shouldShowPermission) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: { toolkit: "discord", label: "Discord", description: "read your profile, servers, and permitted Discord data", iconUrl: "https://cdn.simpleicons.org/discord", mode: "connect" } })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "Discord", "connected-action", []);
    }

    if (isBitcoinPriceQuestion(userText)) {
      const content = await currentBitcoinPriceReply(clientCountryCode, clientLocale);
      return directTextResponse(content, "CoinGecko", "live-price");
    }

    if (isCurrentDateOrTimeQuestion(userText)) {
      const content = currentDateOrTimeReply(clientTimeZone, clientLocale);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "UncGPT Clock", "local-time", []);
    }

    // ==================== SILENT WEB SEARCH ====================
    let searchContext = "";
    const needsSearch =
      webSearch === true || shouldSearchWeb(userText);
    if (needsSearch && userText) {
      console.log(
        `[SilentSearch] Detected search need for: "${userText.substring(0, 80)}..."`
      );
      searchContext = await silentWebSearch(userText);
    }

    let mediaType: "image" | "video" | "chat";
    if (source === "imagine") {
      mediaType = resolveMediaType(userText);
    } else {
      mediaType = "chat";
    }

    let hasImage = false;
    let imageUrl = "";

    for (const msg of messages) {
      if (Array.isArray(msg?.content)) {
        const imgPart = msg.content.find((c: any) => c.type === "image_url");
        if (imgPart && !imgPart.image_url.url.startsWith("blob:")) {
          hasImage = true;
          imageUrl = imgPart.image_url.url;
          break;
        }
      }
      if (msg?.attachments) {
        const imgAtt = msg.attachments.find((a: any) => a.type === "image");
        if (imgAtt && !imgAtt.url.startsWith("blob:")) {
          hasImage = true;
          imageUrl = imgAtt.url;
          break;
        }
      }
    }

    // ==================== MEDIA GENERATION ====================
    if (mediaType === "image" || mediaType === "video") {
      const encoder = new TextEncoder();
      const providerName =
        mediaType === "video" ? "Pollinations AI" : "Cloudflare Workers AI";
      const modelName =
        mediaType === "video"
          ? "stable-video-diffusion"
          : "@cf/black-forest-labs/flux-2-dev";

      const s = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ provider: providerName, model: modelName })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ content: `Generating your ${mediaType}... please wait.` })}\n\n`
            )
          );
          try {
            const url = await generateMedia(mediaType, userText, imageUrl);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ [mediaType]: url })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: `\n\nYour ${mediaType} has been generated successfully!` })}\n\n`
              )
            );
          } catch (err: any) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: `\n\nError: ${err.message}` })}\n\n`
              )
            );
          } finally {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      });

      return new Response(s, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    // ==================== CHAT WITH TOOLS ====================
    const autoRoute = finalModel === "uncgpt" || finalModel === "auto"
      ? chooseUncGptRoute(messages, hasImage)
      : { provider: finalProvider, model: finalModel, reason: "explicit-model" };
    const resolvedProvider = autoRoute.provider;
    const resolvedModel = autoRoute.model;
    const targetModel = resolvedModel;
    const hasVisionCapability = isVisionModel(targetModel) || hasImage;

    const messagesWithVisionFormat = messages.map(convertMessageWithAttachments);
    const apiMessages = await processAttachmentsForModel(
      messagesWithVisionFormat,
      targetModel,
      hasVisionCapability
    );

    // Build system prompt
    const systemContent = TERMINAL_SYSTEM_PROMPT;
    const systemParts: string[] = [
      systemContent,
      `\n\n${UNCGPT_IDENTITY_PROMPT}`,
      `\n\n${buildRuntimeContextMessage({ clientTimeZone, clientLocale, clientCountry, clientCountryCode })}`,
      `\n\nConnected calendar rule: when the user asks to schedule, add, create, move, or cancel a Google Calendar event and a Google Calendar tool is available, use that tool. Create an event only when the title plus a concrete date and start time are clear; otherwise ask one concise follow-up for the missing detail. Convert natural-language dates using the user’s runtime time zone and pass the calendar tool an exact ISO date-time. Never say an event was scheduled unless the provider tool confirms success. For confirmed events, keep the final reply concise because the interface renders the verified event card.`,
    ];
    if (projectInstructions) {
      systemParts.push(`\n\nProject Instructions:\n${projectInstructions}`);
    }
    if (projectMemory) {
      systemParts.push(`\n\n[MEMORY]:\n${projectMemory}`);
    }

    let messagesWithSystem: any[] = [
      { role: "system", content: systemParts.join("") },
    ];

    if (searchContext) {
      messagesWithSystem.push({
        role: "assistant",
        content: `Here is the current information I found from web search:\n\n${searchContext}\n\nI will now answer your question based on this up-to-date information.`,
      });
    }

    messagesWithSystem = [...messagesWithSystem, ...apiMessages];

    const toolSteps: Array<{
      iteration: number;
      action: "tool_use";
      tool: string;
      input: any;
      result: string;
    }> = [];

    // ==================== TOOL SETUP ====================
    const explicitGithubRepositoryRequest = /github/i.test(userText) && /\b(repo|repos|repositories)\b/i.test(userText) && !/\b(create|new|make|delete|remove|update|edit|push|commit|change)\b/i.test(userText);
    const contextualGithubFollowUp = /^(it is|yes|yeah|yep|list them|show them|go ahead|do it|okay|ok)$/i.test(String(userText).trim()) && /github/i.test(recentConversationText) && /\b(repo|repos|repositories)\b/i.test(recentConversationText);
    const isGithubRepositoryRequest = explicitGithubRepositoryRequest || contextualGithubFollowUp;
    let availableTools: any[] = computerUse === false ? [...BUILTIN_TOOLS] : buildAgentComputerTools();
    try {
      const oauthBundle = buildOAuthTools(req, baseUrl);
      const oauthConnected = new Set((oauthBundle.connected || []).map((provider: string) => String(provider).toLowerCase().replace(/[- ]/g, '_')));
      const githubCreateRequest = isGithubCreateRepositoryRequest(userText);
      const websiteBuildRequest = isWebsiteBuildRequest(userText) || isWebsiteFollowUpRequest(userText, recentConversationText);
      let websiteRepository = extractGithubRepositoryRef(userText) || extractGithubRepositoryRef(recentConversationText);
      const websiteConversationText = `${recentConversationText}\n${userText}`;
      // A request to create a GitHub website should be publishable by default.
      // Users can explicitly opt out when they only want repository files.
      const wantsGithubPages = websiteBuildRequest && !/\b(?:do\s+not|don't|dont|no)\s+(?:deploy|publish|github\s*pages)\b/i.test(websiteConversationText);
      const wantsVercel = /\bvercel\b/i.test(websiteConversationText);
      const composioGithubPreference = Array.isArray(mcpConnectors)
        ? mcpConnectors.find((connector: any) => normalizeConnectorKeyForRouting(connector.provider || connector.toolkit || connector.name) === "github" && connector?.enabled !== false)
        : null;
      let websiteComposioSession: any = null;
      let githubComposioConnected = false;
      if (websiteBuildRequest && !oauthConnected.has("github") && process.env.COMPOSIO_API_KEY) {
        try {
          const session = await getSession();
          const userId = session?.user?.sub;
          if (userId) {
            // Create a user-scoped session even if the cached browser connector list is stale.
            // A live execute call is more authoritative than localStorage and prevents a
            // connected Composio account from receiving a false Connect card.
            const enabledToolkits = await getEnabledComposioToolkits(userId).catch(() => []);
            const githubToolkit = enabledToolkits.find((toolkit) => normalizeConnectorKeyForRouting(toolkit) === "github");
            githubComposioConnected = Boolean(githubToolkit);
            websiteComposioSession = await getComposioSession(userId, [githubToolkit || "github"]);
          }
        } catch (error) {
          console.warn("Composio GitHub website session lookup failed", error);
        }
      }
      if (websiteBuildRequest && !websiteRepository && !oauthConnected.has("github") && !githubComposioConnected) {
        return connectorPermissionResponse("github", "GitHub", "create and update website files and commits", "https://cdn.simpleicons.org/github");
      }
      if (websiteBuildRequest && !websiteRepository && oauthConnected.has("github")) {
        try {
          const profile: any = await executeOAuthGithubAction(baseUrl, req.headers.get("cookie") || "", "get_user", {});
          const owner = String(profile?.login || profile?.name || "").trim();
          if (owner) websiteRepository = { owner, repo: generateWebsiteRepositoryName(userText) };
        } catch (error) {
          console.warn("Could not derive GitHub username for website creation", error);
        }
      }
      if (websiteBuildRequest && !websiteRepository && websiteComposioSession) {
        try {
          const search = await websiteComposioSession.search({ query: "get the authenticated GitHub user profile", toolkits: ["github"] });
          const schemas = normalizeComposioSearchSchemas(search);
          const profileSchema = schemas.find((schema: any) => /(?:get|retrieve|fetch|current|authenticated).*(?:user|profile)|(?:user|profile).*(?:get|retrieve|fetch|current|authenticated)/i.test(`${schema?.toolSlug || ""} ${schema?.name || ""} ${schema?.description || ""}`)) || knownComposioGithubSchema("GITHUB_GET_THE_AUTHENTICATED_USER");
          const profileResponse: any = await websiteComposioSession.execute(profileSchema.toolSlug, {});
          const rawProfile: any = profileResponse?.data ?? profileResponse;
          const profile: any = parseComposioObject(rawProfile) || rawProfile;
          const owner = String(profile?.login || profile?.username || profile?.name || profile?.data?.login || profile?.data?.username || "").trim();
          if (owner) websiteRepository = { owner, repo: generateWebsiteRepositoryName(userText) };
        } catch (error) {
          console.warn("Could not derive Composio GitHub username for website creation", error);
        }
      }
      if (websiteBuildRequest) {
        if (!websiteRepository) return directTextResponse("I need a GitHub repository like **your-username/your-repository**, or a connected GitHub account that exposes your username, before I can create and deploy the site.", "GitHub", "connected-action");
        if (!oauthConnected.has("github") && !githubComposioConnected) return connectorPermissionResponse("github", "GitHub", "create and update website files and commits", "https://cdn.simpleicons.org/github");
        if (!oauthConnected.has("github") && !websiteComposioSession) return directTextResponse("Your GitHub account is connected, but I could not open its action session right now. Please try again in a moment; you do not need to reconnect it.", "GitHub", "connector-error");
        if (wantsVercel && !oauthConnected.has("vercel")) return connectorPermissionResponse("vercel", "Vercel", "deploy the committed GitHub website", "https://cdn.simpleicons.org/vercel");
        try {
          const result = websiteComposioSession && !oauthConnected.has("github")
            ? await executeComposioWebsiteScaffold(websiteComposioSession, websiteRepository.owner, websiteRepository.repo, userText, wantsGithubPages)
            : await executeWebsiteScaffold(baseUrl, req.headers.get("cookie") || "", websiteRepository.owner, websiteRepository.repo, userText, wantsGithubPages, wantsVercel);
          const lines = [`Created and committed the website files in **${websiteRepository.owner}/${websiteRepository.repo}**: ${result.files.join(", ")}.`];
          const launchUrl = result.githubPagesUrl || result.vercelUrl;
          const launchStatus = result.githubPagesUrl ? result.githubPagesStatus : result.vercelState;
          const launchVerified = result.githubPagesUrl ? result.githubPagesVerified === true : Boolean(result.vercelUrl && /ready|success/i.test(String(result.vercelState || "")));
          if (launchUrl) {
            lines.push(`[[UNCGPT_WEBSITE_DEPLOYMENT:${JSON.stringify({ title: result.githubPagesUrl ? "GitHub Pages deployment" : "Vercel deployment", repository: `${websiteRepository.owner}/${websiteRepository.repo}`, url: launchUrl, status: launchStatus || (launchVerified ? "ready" : "building"), verified: launchVerified })}]]`);
          }
          return directTextResponse(lines.join("\n"), wantsGithubPages && wantsVercel ? "GitHub + GitHub Pages + Vercel" : wantsGithubPages ? "GitHub Pages" : wantsVercel ? "Vercel" : "GitHub", "connected-action");
        } catch (error: any) {
          return directTextResponse(`I couldn’t finish the website publish for **${websiteRepository.owner}/${websiteRepository.repo}**. ${String(error?.message || "The connected service did not confirm the requested write or deployment.").slice(0, 360)}`, "GitHub", "connector-error");
        }
      }
      if (githubCreateRequest && oauthConnected.has("github")) {
        const name = extractGithubRepositoryName(userText);
        if (!name) {
          return directTextResponse("What name should I use for the new GitHub repository?", "GitHub", "connected-action");
        }
        try {
          const repository = await executeOAuthGithubAction(baseUrl, req.headers.get("cookie") || "", "create_repo", { name, private: /\bprivate\b/i.test(userText) });
          const fullName = repository?.full_name || repository?.name || name;
          const repositoryUrl = repository?.html_url || `https://github.com/${fullName}`;
          return directTextResponse(`Created the GitHub repository **${repository?.name || name}**.\n\n[Open ${fullName}](${repositoryUrl})`, "GitHub", "connected-action");
        } catch (error: any) {
          return directTextResponse(`I couldn’t create the GitHub repository **${name}**. ${String(error?.message || "GitHub did not confirm the creation.").slice(0, 300)}`, "GitHub", "connector-error");
        }
      }
      let mcpTools: any[] = [];
      let composioTools: any[] = [];
      let composioSession: any = null;
      const connectorPreferences = Array.isArray(mcpConnectors) ? mcpConnectors : [];
      const disabledToolkits = new Set(connectorPreferences.filter((connector: any) => connector?.source === 'composio' && connector?.enabled === false).map((connector: any) => String(connector.provider || connector.toolkit || '').toLowerCase()).filter(Boolean));
      const activeMcpConnectors = connectorPreferences.filter((connector: any) => connector?.enabled !== false);

      // If a user asks for a connector that is absent or explicitly disabled, stop before
      // the model can hallucinate access and return a structured approval card instead.
      const connectorHints: Record<string, { label: string; description: string; iconUrl: string }> = {
        github: { label: 'GitHub', description: 'read and manage repositories, issues, and pull requests', iconUrl: 'https://cdn.simpleicons.org/github' },
        gmail: { label: 'Gmail', description: 'read and manage your email', iconUrl: 'https://cdn.simpleicons.org/gmail' },
        slack: { label: 'Slack', description: 'read channels and send messages', iconUrl: 'https://cdn.simpleicons.org/slack' },
        notion: { label: 'Notion', description: 'read and update pages and databases', iconUrl: 'https://cdn.simpleicons.org/notion' },
        linear: { label: 'Linear', description: 'read and manage issues and projects', iconUrl: 'https://cdn.simpleicons.org/linear' },
        google_drive: { label: 'Google Drive', description: 'find and edit files', iconUrl: 'https://cdn.simpleicons.org/googledrive' },
        google_calendar: { label: 'Google Calendar', description: 'read and manage calendar events', iconUrl: 'https://cdn.simpleicons.org/googlecalendar' },
        vercel: { label: 'Vercel', description: 'read and manage deployments', iconUrl: 'https://cdn.simpleicons.org/vercel' },
        discord: { label: 'Discord', description: 'read your profile, servers, and permitted Discord data', iconUrl: 'https://cdn.simpleicons.org/discord' },
        dropbox: { label: 'Dropbox', description: 'find and manage your files', iconUrl: 'https://cdn.simpleicons.org/dropbox' },
        trello: { label: 'Trello', description: 'read and manage boards and cards', iconUrl: 'https://cdn.simpleicons.org/trello' },
        jira: { label: 'Jira', description: 'read and manage issues and projects', iconUrl: 'https://cdn.simpleicons.org/jira' },
        supabase: { label: 'Supabase', description: 'read and manage projects and databases', iconUrl: 'https://cdn.simpleicons.org/supabase' },
      };
      const connectorConfirmation = /^(?:yes|yeah|yep|i\s+(?:do\s+)?have\s+(?:it|that|the\s+(?:app|connector|calendar))\s+connected|it(?:'s|\s+is)\s+connected|already\s+connected)\b/i.test(userText.trim());
      const historicalCalendarRequest = /\b(?:schedule|appointment|meeting|calendar\s+event|set\s+up\s+(?:a\s+)?reminder)\b/i.test(recentUserText);
      const calendarSchedulingIntent = /\b(?:schedule|appointment|meeting|calendar\s+event|set\s+up\s+(?:a\s+)?reminder)\b/i.test(userText) || (connectorConfirmation && historicalCalendarRequest);
      const resolveMentionedConnector = (text: string) => Object.keys(connectorHints).find((key) => {
        const pattern = key.replace(/_/g, '[ _-]?');
        const directMatch = new RegExp(`\\b${pattern}\\b`, 'i').test(text);
        const aliasMatch = key === 'gmail' && /\\b(email|emails|mail|inbox)\\b/i.test(text);
        return directMatch || aliasMatch;
      });
      const staticConnectorKey = resolveMentionedConnector(userText) || (connectorConfirmation ? resolveMentionedConnector(recentUserText) : undefined) || (calendarSchedulingIntent ? 'google_calendar' : undefined);
      const dynamicConnectorKey = connectorPreferences
        .filter((connector: any) => connector?.source === 'composio' && connector?.enabled !== false)
        .map((connector: any) => String(connector.provider || connector.toolkit || '').toLowerCase())
        .find((toolkit: string) => {
          const tokens = toolkit.replace(/[-_]/g, ' ').split(/\s+/).filter((token) => token.length > 2);
          return tokens.length > 0 && tokens.every((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(userText));
        });
      const requestedConnectorKey = staticConnectorKey || dynamicConnectorKey;
      const connectorActionIntent = /\b(my|mine|latest|list|show|find|read|send|email|message|calendar|create|update|delete|open|search|manage|deploy|repository|repositories|repo|schedule|appointment|meeting|event|remind)\b/i.test(userText) || (connectorConfirmation && /\b(send|create|update|edit|delete|schedule|deploy|upload|move|write|add)\b/i.test(recentUserText));
      const connectorWriteIntent = /\b(send|create|update|edit|delete|schedule|deploy|upload|move|write|add|publish|commit)\b/i.test(userText) || (connectorConfirmation && /\b(send|create|update|edit|delete|schedule|deploy|upload|move|write|add|publish|commit)\b/i.test(recentUserText));
      const requestedConnector = requestedConnectorKey
        ? connectorHints[requestedConnectorKey] || {
            label: requestedConnectorKey.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
            description: `read and manage your ${requestedConnectorKey.replace(/[_-]/g, ' ')} data`,
            iconUrl: `https://cdn.simpleicons.org/${requestedConnectorKey.replace(/[^a-z0-9-]/g, '')}` ,
          }
        : null;
      let requestedState = requestedConnectorKey ? connectorPreferences.find((connector: any) => connectorKeysMatch(connector.provider || connector.toolkit || connector.name, requestedConnectorKey)) : null;
      if (requestedConnectorKey && oauthConnected.has(requestedConnectorKey)) {
        requestedState = { source: 'oauth', provider: requestedConnectorKey, toolkit: requestedConnectorKey, enabled: true };
      }
      // Client storage can be stale or empty. Resolve the live Composio account before deciding
      // whether to ask for authorization, so the AI and connector panel see the same state.
      if (requestedConnectorKey && process.env.COMPOSIO_API_KEY && (!requestedState || requestedState.enabled === false) && !oauthConnected.has(requestedConnectorKey)) {
        try {
          const liveSession = await getSession();
          const liveUserId = liveSession?.user?.sub;
          const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
          const liveAccounts: any = liveUserId ? await composio.connectedAccounts.list({ userIds: getComposioUserIds(liveUserId), limit: 1000 }) : null;
          const liveAccount = (liveAccounts?.items || []).find((account: any) => {
            const toolkit = String(account?.toolkit?.slug || '').toLowerCase().replace(/[- ]/g, '_');
            const status = String(account?.status || '').toLowerCase();
            return connectorKeysMatch(toolkit, requestedConnectorKey) && !account?.isDisabled && ['active', 'connected', 'success'].includes(status);
          });
          if (liveAccount) requestedState = { source: 'composio', provider: requestedConnectorKey, toolkit: requestedConnectorKey, accountId: liveAccount.id, enabled: true };
        } catch (error) {
          console.warn('Live connector state lookup failed:', error);
        }
      }
      if (calendarSchedulingIntent && (!requestedState || requestedState.enabled === false)) {
        return connectorPermissionResponse('googlecalendar', 'Google Calendar', 'create and manage calendar events', 'https://cdn.simpleicons.org/googlecalendar');
      }
      if (requestedConnector && connectorActionIntent && (!requestedState || requestedState.enabled === false) && !isGithubRepositoryRequest) {
        const mode = requestedState ? 'enable' : 'connect';
        const permission = { toolkit: composioToolkitSlug(requestedConnectorKey), label: requestedConnector.label, description: requestedConnector.description, iconUrl: requestedConnector.iconUrl, accountId: requestedState?.accountId, mode };
        const encoder = new TextEncoder();
        const stream = new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: requestedConnector.label, model: 'connector-permission' })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: permission })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: mode === 'connect' ? `Connect ${requestedConnector.label} to continue.` : `Turn on ${requestedConnector.label} to continue.` })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }});
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      }
      try {
        const shouldLoadConnectedTools = Boolean(requestedConnectorKey && connectorActionIntent);
        if (shouldLoadConnectedTools) {
          let matchedToolkit: string | undefined;
          const session = await getSession();
          if (session?.user?.sub && requestedConnectorKey) {
            const enabledToolkits = await getEnabledComposioToolkits(session.user.sub);
            matchedToolkit = enabledToolkits.find(
              (toolkit) => connectorKeysMatch(toolkit, requestedConnectorKey)
            );
            if (matchedToolkit) {
              composioSession = await Promise.race([
                getComposioSession(session.user.sub, [matchedToolkit]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connector lookup timed out')), 10000)),
              ]);
            }
          }
          const deterministicCalendarCreate = calendarSchedulingIntent && requestedConnectorKey === 'google_calendar'
            ? parseDeterministicCalendarCreate(userText, clientTimeZone)
            : null;
          if (composioSession && deterministicCalendarCreate) {
            try {
              return directTextResponse(await executeVerifiedGoogleCalendarCreate(composioSession, deterministicCalendarCreate), 'Google Calendar', 'connected-action');
            } catch (error: any) {
              const message = String(error?.message || 'Google Calendar did not verify the event.').replace(/https?:\/\/\S+/g, '').slice(0, 300);
              return directTextResponse(`I couldn’t schedule that event because Google Calendar did not verify it. ${message}`, 'Google Calendar', 'connector-error');
            }
          }
          if (composioSession && requestedConnectorKey === "gmail" && isReadOnlyConnectorRequest(userText)) {
            try {
              const result = await executeLatestGmailMessages(composioSession);
              return directTextResponse(result, "Gmail");
            } catch (error: any) {
              const message = String(error?.message || "Unable to retrieve email.")
                .replace(/https?:\/\/\S+/g, "")
                .slice(0, 240);
              return directTextResponse(
                `Gmail is connected, but I could not retrieve your latest emails. ${message} Reconnect Gmail in Settings → Connectors and try again if this keeps happening.`,
                "Gmail",
                "connector-error"
              );
            }
          }
          if (composioSession && requestedConnectorKey) {
            const search = await composioSession.search({
              query: userText,
              toolkits: [matchedToolkit!],
            });
            const calendarSearch = calendarSchedulingIntent
              ? await composioSession.search({ query: 'Create a Google Calendar event using an exact ISO start date and duration.', toolkits: [matchedToolkit!] })
              : null;
            const discoveredSchemas = [...normalizeComposioSearchSchemas(search), ...normalizeComposioSearchSchemas(calendarSearch)]
              .filter((schema: any, index: number, all: any[]) => all.findIndex((candidate: any) => candidate?.toolSlug === schema?.toolSlug) === index);
            composioTools = discoveredSchemas
              .slice(0, 8)
              .map((schema: any) => ({
                type: "function",
                function: {
                  name: `composio__${schema.toolSlug}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
                  description: `[${schema.toolkit || matchedToolkit}] ${schema.description || schema.toolSlug}`,
                  parameters: schema.inputSchema,
                },
                _composioSlug: schema.toolSlug,
                _exec: async (args: any) => {
                  if (/GOOGLECALENDAR.*CREATE.*EVENT/i.test(String(schema.toolSlug))) return executeVerifiedGoogleCalendarCreate(composioSession, args || {});
                  const result = await composioSession.execute(schema.toolSlug, args || {});
                  if (result?.error || result?.successful === false || result?.data?.error) throw new Error(String(result?.error || result?.data?.error || 'The connected service did not confirm the action.'));
                  return normalizeConnectorResult(result?.data ?? result, schema.toolSlug);
                },
              }));
            if (calendarSchedulingIntent && !composioTools.some((tool: any) => /GOOGLECALENDAR.*CREATE.*EVENT/i.test(String(tool?._composioSlug || tool?.function?.name || '')))) {
              composioTools.push({
                type: 'function',
                function: {
                  name: 'composio__GOOGLECALENDAR_CREATE_EVENT',
                  description: 'Create a real event in the connected Google Calendar. Use only when the user supplied an event title, concrete date, start time, and duration. Datetimes must be exact ISO values in the user time zone.',
                  parameters: { type: 'object', properties: { summary: { type: 'string' }, start_datetime: { type: 'string', description: 'ISO local date-time, for example 2026-08-27T15:00:00' }, timezone: { type: 'string' }, event_duration_hour: { type: 'integer' }, event_duration_minutes: { type: 'integer' }, description: { type: 'string' }, calendar_id: { type: 'string' } }, required: ['summary', 'start_datetime'] },
                },
                _composioSlug: 'GOOGLECALENDAR_CREATE_EVENT',
                _exec: async (args: Record<string, unknown>) => executeVerifiedGoogleCalendarCreate(composioSession, args),
              });
            }
            if (githubCreateRequest && requestedConnectorKey === "github" && composioSession && !oauthConnected.has("github")) {
              const createTool = composioTools.find((tool: any) => {
                const descriptor = `${tool?.function?.name || ""} ${tool?.function?.description || ""}`.toLowerCase();
                return /create.*(?:repo|repository)|(?:repo|repository).*create/.test(descriptor) && !/list|search|get|read/.test(descriptor);
              });
              const name = extractGithubRepositoryName(userText);
              if (!name) return directTextResponse("What name should I use for the new GitHub repository?", "GitHub", "connected-action");
              if (!createTool) {
                return directTextResponse("GitHub is connected, but its create-repository action is unavailable right now. Reconnect GitHub in Settings → Connectors and try again.", "GitHub", "connector-error");
              }
              try {
                const schema = createTool.function?.parameters || {};
                const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
                const nameKey = ["name", "repo_name", "repository_name", "repoName", "repositoryName"].find((key) => properties[key]) || "name";
                const args: Record<string, unknown> = { [nameKey]: name };
                const description = userText.match(/\b(?:described|description)\s+(?:as|is)\s+["“”']?(.+?)["“”']?$/i)?.[1]?.trim();
                const descriptionKey = ["description", "repo_description", "repository_description"].find((key) => properties[key]);
                if (description && descriptionKey) args[descriptionKey] = description;
                const privateKey = ["private", "is_private", "visibility"].find((key) => properties[key]);
                if (privateKey) args[privateKey] = privateKey === "visibility" ? (/\bprivate\b/i.test(userText) ? "private" : "public") : /\bprivate\b/i.test(userText);
                const response: any = await composioSession.execute(createTool._composioSlug, args);
                if (response?.error || response?.successful === false) throw new Error(String(response?.error || "GitHub did not confirm repository creation."));
                const data: any = response?.data ?? response;
                const fullName = data?.full_name || data?.fullName || data?.name || name;
                const repositoryUrl = data?.html_url || data?.url || `https://github.com/${fullName}`;
                return directTextResponse(`Created the GitHub repository **${data?.name || name}**.\n\n[Open ${fullName}](${repositoryUrl})`, "GitHub", "connected-action");
              } catch (error: any) {
                return directTextResponse(`I couldn’t create the GitHub repository **${name}**. ${String(error?.message || "GitHub did not confirm the creation.").slice(0, 300)}`, "GitHub", "connector-error");
              }
            }
            if (search?.success && composioTools.length === 0) {
              console.warn("Composio returned no executable tool schemas", {
                toolkit: matchedToolkit,
                nextSteps: search?.nextStepsGuidance,
              });
            }
          }
        }
      } catch (error) {
        console.error("Composio session unavailable:", error);
      }
      const remoteMcpConnectors = activeMcpConnectors.filter((connector: any) => connector?.source !== "composio");
      if (requestedConnectorKey && connectorActionIntent && remoteMcpConnectors.length > 0) {
        mcpTools = await fetchMcpTools(remoteMcpConnectors, baseUrl);
      }

      const computerIntent = /\b(open|navigate|inspect|click|type|scroll|browser|terminal|command|file|folder|filesystem|computer|website|site)\b/i.test(userText);
      const shouldUseTools = Boolean(requestedConnectorKey && connectorActionIntent) || computerIntent;
      const combinedTools = shouldUseTools
        ? [
            ...availableTools,
            ...oauthBundle.tools,
            ...composioTools,
            ...mcpTools,
          ]
        : [];
      availableTools = combinedTools;

      if (githubCreateRequest && !oauthConnected.has("github") && !composioSession) {
        return directTextResponse("I couldn’t load GitHub’s create-repository action. Reconnect GitHub in Settings → Connectors and try again.", "GitHub", "connector-error");
      }

      const directReadTool = requestedConnectorKey && isReadOnlyConnectorRequest(userText)
        ? composioTools.find((tool: any) => isSafeReadConnectorTool(tool))
        : null;
      if (directReadTool) {
        const args = defaultReadToolArguments(directReadTool.function?.parameters);
        if (args) {
          const result = await directReadTool._exec(args);
          if (!String(result).startsWith("Tool error:")) {
            return directTextResponse(String(result), requestedConnector?.label || requestedConnectorKey);
          }
        }
      }

      if (combinedTools.length > 0 && !isGithubRepositoryRequest) {
        messagesWithSystem = await runToolLoop(
          messagesWithSystem,
          combinedTools,
          baseUrl,
          (s) => toolSteps.push(s)
        );
      }

      if (calendarSchedulingIntent && !composioSession) {
        return connectorPermissionResponse('googlecalendar', 'Google Calendar', 'create and manage calendar events', 'https://cdn.simpleicons.org/googlecalendar');
      }

      const calendarStep = toolSteps.find((step) => /GOOGLECALENDAR.*CREATE.*EVENT/i.test(String(step?.tool || '')));
      if (calendarSchedulingIntent) {
        if (!calendarStep) return directTextResponse('I could not verify a Google Calendar create action, so no event was created. Please retry the schedule request; do not rely on any earlier text response.', 'Google Calendar', 'connector-error');
        const resultText = String(calendarStep.result || '');
        if (/\[\[UNCGPT_CALENDAR_EVENT:/.test(resultText)) return directTextResponse(resultText, 'Google Calendar', 'connected-action');
        const safeError = resultText.replace(/^Tool error:\s*/i, '').replace(/https?:\/\/\S+/g, '').slice(0, 260);
        return directTextResponse(`I couldn’t schedule that event because Google Calendar did not verify it. ${safeError || 'Please try again after reconnecting Google Calendar.'}`, 'Google Calendar', 'connector-error');
      }

      if (requestedConnectorKey && connectorWriteIntent) {
        const verifiedWriteStep = toolSteps.find((step) => {
          const toolName = String(step?.tool || '').toLowerCase();
          const resultText = String(step?.result || '');
          return !/^tool error:/i.test(resultText) && /(?:create|update|edit|delete|send|write|upload|deploy|publish|commit|move|insert|add)/.test(toolName) && !/(?:list|search|get|read|find)/.test(toolName);
        });
        if (!verifiedWriteStep) {
          const label = requestedConnector?.label || requestedConnectorKey.replace(/[_-]/g, ' ');
          return directTextResponse(`I could not verify a ${label} write action, so no change was made. Please retry after checking the connector status.`, label, 'connector-error');
        }
      }
    } catch (e: any) {
      console.error("Tool loop error:", e.message);
      const connectorWriteAfterFailure = /\b(send|create|update|edit|delete|schedule|deploy|upload|move|write|add|publish|commit)\b/i.test(`${userText}\n${recentUserText}`);
      const calendarAfterFailure = /\b(schedule|appointment|meeting|calendar\s+event|set\s+up\s+(?:a\s+)?reminder)\b/i.test(`${userText}\n${recentUserText}`);
      if (calendarAfterFailure) return directTextResponse('I could not verify a Google Calendar action, so no event was created. Please retry after checking the Calendar connection.', 'Google Calendar', 'connector-error');
      if (connectorWriteAfterFailure) return directTextResponse('I could not verify the connected-app write action, so no change was made. Please retry after checking the connector status.', 'Connector', 'connector-error');
    }

    // ==================== VERIFIED GITHUB READS ====================
    // Repository listing is a read-only connector action. Handle it directly so
    // an unavailable or malformed connector response can never be turned into
    // invented repository names by a fallback model.
    if (isGithubRepositoryRequest) {
      let reply = "GitHub isn’t connected yet. Open Settings → Connectors and connect GitHub.";
      try {
        const session = await getSession();
        const githubPreference = Array.isArray(mcpConnectors) ? mcpConnectors.find((connector: any) => connector?.source === 'composio' && String(connector.provider || connector.toolkit || '').toLowerCase() === 'github' && connector?.enabled !== false) : null;
        const resultText = await executeVerifiedGithubRepositories(session?.user?.sub || "", githubPreference?.accountId);
        if (resultText === NO_GITHUB_ACCOUNT) {
          reply = "GitHub isn’t connected yet. Open Settings → Connectors and connect GitHub.";
        } else if (resultText === UNVERIFIED_GITHUB_RESULT) {
          reply = "GitHub is connected, but it didn’t return verifiable repository data. Reconnect GitHub in Settings → Connectors and try again.";
        } else if (resultText === "GitHub returned no repositories.") {
          reply = "I couldn’t find any GitHub repositories on the connected account.";
        } else if (resultText.startsWith("- ")) {
          reply = `Here are your GitHub repositories:\n${resultText}`;
        }
      } catch {
        reply = "I couldn’t access GitHub. Reconnect it in Settings → Connectors and try again.";
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: "GitHub", model: "connected-action" })}\n\n`));
          if (reply.includes("isn’t connected") || reply.includes("Reconnect GitHub")) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: { toolkit: "github", label: "GitHub", description: "read your repositories, issues, and pull requests", iconUrl: "https://cdn.simpleicons.org/github", mode: "connect" } })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "GitHub", "connected-action", []);
    }

    // ==================== VERIFIED DISCORD READS ====================
    // Discord identity/server reads are handled directly so a connected account
    // cannot be replaced by generic model prose or invented sample data.
    const discordReadIntent = detectDiscordReadIntent(userText);
    if (discordReadIntent) {
      let reply = "Discord isn’t connected yet. Open Settings → Connectors and connect Discord.";
      let shouldShowPermission = true;
      try {
        const session = await getSession();
        const resultText = await executeVerifiedDiscordRead(session?.user?.sub || "", discordReadIntent);
        if (resultText !== NO_GITHUB_ACCOUNT && resultText !== UNVERIFIED_GITHUB_RESULT) {
          const heading = discordReadIntent === "user" ? "Here is your verified Discord account information:" : discordReadIntent === "servers" ? "Here are your verified Discord servers:" : "Here are your verified Discord channels:";
          reply = `${heading}\n\n\`\`\`json\n${resultText}\n\`\`\``;
          shouldShowPermission = false;
        } else if (resultText === UNVERIFIED_GITHUB_RESULT) {
          reply = "Discord is connected, but it did not return verifiable data for that request.";
          shouldShowPermission = false;
        }
      } catch {
        reply = "I couldn’t access the connected Discord account right now. Please try again.";
        shouldShowPermission = false;
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: "Discord", model: "connected-action" })}\\n\\n`));
          if (shouldShowPermission) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: { toolkit: "discord", label: "Discord", description: "read your profile, servers, and permitted Discord data", iconUrl: "https://cdn.simpleicons.org/discord", mode: "connect" } })}\\n\\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply })}\\n\\n`));
          controller.enqueue(encoder.encode("data: [DONE]\\n\\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "Discord", "connected-action", []);
    }

    // ==================== CALL MODEL ====================
    let result: { stream: ReadableStream; provider: string; model: string };

    try {
      if (resolvedProvider === "openai") {
        result = await callOpenAI(messagesWithSystem, hasImage, availableTools);
      } else if (resolvedProvider === "groq" || GROQ_CHAT_MODELS[resolvedModel]) {
        result = await callGroq(messagesWithSystem, resolvedModel, hasImage, availableTools);
      } else if (resolvedProvider === "openrouter") {
        result = await callOpenRouter(messagesWithSystem, hasImage, availableTools);
      } else if (resolvedProvider === "cloudflare" || resolvedModel.startsWith("@cf/")) {
        result = await callChatWorkers(
          { task: "chat", messages: messagesWithSystem },
          resolvedModel,
          hasImage,
          availableTools
        );
      } else {
        result = await fallbackChat(messagesWithSystem, hasImage, availableTools);
      }
    } catch (primaryErr: any) {
      console.error("[Main] Primary provider failed:", primaryErr);
      result = await fallbackChat(messagesWithSystem, hasImage, availableTools);
    }

    console.log(
      `[UNCGPT] Model: ${result.model} | Provider: ${result.provider}`
    );
    return createStreamResponse(
      result.stream,
      result.provider,
      result.model,
      toolSteps
    );
  } catch (err: any) {
    console.error("[Main] Fatal error:", err);
    return Response.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("conversationId");

  if (!id) {
    const list = Array.from(conversations.values()).map((c: any) => ({
      id: c.id,
      createdAt: c.createdAt,
      messageCount: c.messages.length,
    }));
    return Response.json({ conversations: list });
  }

  const conv = conversations.get(id);
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ conversation: conv });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("conversationId");

  if (!id) {
    return Response.json({ error: "Missing conversationId" }, { status: 400 });
  }

  conversations.delete(id);
  return Response.json({ success: true });
}
