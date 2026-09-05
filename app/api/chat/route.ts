import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { findEnabledComposioAccount, getComposioSession, getComposioUserId, getComposioUserIds, getEnabledComposioToolkits, getLiveComposioAccounts } from "@/lib/composio";
import { Composio } from "@composio/core";
import { chooseUncGptRoute } from "@/lib/uncgpt-router";
import { executeAgentGateway, gatewayResultText } from "@/lib/agent-gateway";
import { normalizeConnectorResult } from "@/lib/connector-results";
import { composioToolkitSlug, connectorKeysMatch, isCalendarSchedulingIntent, isConnectorWriteIntent, isWrappedConnectorFailure, normalizeConnectorKeyForRouting, parseDeterministicCalendarCreate } from "@/lib/connector-action-safety";
import { languagePreferenceInstruction } from "@/lib/language-preferences";
import { detectWebsiteFeedbackIntent, websiteFeedbackInstruction } from "@/lib/website-feedback-intent.mjs";
import { generateMiniMaxImage, generateMiniMaxVideo, hasMiniMaxMediaKey, isExplicitMediaGenerationRequest } from "@/lib/minimax-media";

export const runtime = "nodejs";
export const maxDuration = 300;
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
const IMAGE_VIDEO_WORKER_URL = process.env.IMAGE_VIDEO_WORKER_URL || "https://old-hat-dab9.gamingac527.workers.dev";
const IMAGE_MODELS = [
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/black-forest-labs/flux-2-dev",
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
const MINIMAX_CHAT_MODEL = process.env.MINIMAX_CHAT_MODEL || "MiniMax-M2.1";
const NVIDIA_NIM_KEY = process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY || "";
const NVIDIA_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || "moonshotai/kimi-k3";

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
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,${currency}&include_24hr_change=true&include_last_updated_at=true`, { headers: { Accept: "application/json", "User-Agent": "Lunar/1.0" }, signal: AbortSignal.timeout(8000) });
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
      headers: { "Accept": "application/rss+xml, application/xml, text/xml", "User-Agent": "Lunar/1.0" },
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
      headers: { "Accept": "text/plain", "User-Agent": "Lunar/1.0" },
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
      headers: { "Accept": "text/html", "User-Agent": "Mozilla/5.0 (compatible; Lunar/1.0)" },
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
          "User-Agent": "Mozilla/5.0 (compatible; Lunar/1.0)",
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
        "User-Agent": "Mozilla/5.0 (compatible; Lunar/1.0; +https://unc-gptt.vercel.app)",
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
    const videoParts: any[] = [];
    for (const part of msg.content) {
      if (part.type === "text") {
        textParts.push(part.text);
      } else if (part.type === "video_url") {
        const videoUrl = part.video_url?.url;
        if (videoUrl && !videoUrl.startsWith("blob:") && hasVision) {
          videoParts.push({ type: "video_url", video_url: { url: videoUrl } });
        } else if (videoUrl) {
          textParts.push(`[User attached a video. You can view it at: ${videoUrl}]`);
        }
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
    if (hasVision && (imageParts.length > 0 || videoParts.length > 0)) {
      processed.push({
        role: msg.role,
        content: [
          { type: "text", text: processedText || "Please analyze the attached media and answer the user's question:" },
          ...imageParts,
          ...videoParts,
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
    } else if (att.type === "video") {
      const videoUrl = att.permanentUrl || att.url;
      if (videoUrl) content.push({ type: "video_url", video_url: { url: videoUrl } });
    }
  }
  return { ...msg, content: content.length > 0 ? content : msg.content };
}

// ============================================================
// MEDIA GENERATION
// ============================================================
function isVideoRequest(prompt: string): boolean {
  return /(video|animation|clip|film|movie|motion|footage|reel|short|timelapse|animate|cinematic|slow.?mo|animato|animata|animazione|vídeo|vidéo)/i.test(
    prompt
  );
}

function isImageRequest(prompt: string): boolean {
  return /(image|picture|photo|logo|art|icon|vector|illustration|wallpaper|portrait|poster|banner|thumbnail|drawing|sketch|immagine|immagini|foto|imagen|bild|illustración)/i.test(
    prompt
  );
}

function resolveMediaType(prompt: string): "video" | "image" | "chat" {
  if (isVideoRequest(prompt)) return "video";
  if (isImageRequest(prompt)) return "image";
  return "chat";
}

async function generateImage(prompt: string): Promise<string> {
  const cloudflareAccountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const cloudflareToken = String(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_WORKERS_AI_TOKEN || "").trim();
  if (cloudflareAccountId && cloudflareToken && !IMAGE_VIDEO_WORKER_URL.includes("old-hat-dab9.gamingac527.workers.dev")) {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/ai/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cloudflareToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "@cf/black-forest-labs/flux-1-schnell", input: { prompt: String(prompt).slice(0, 1500) } }),
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("image") || contentType.includes("octet-stream")) {
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength > 1000) return `data:${contentType.split(";")[0] || "image/png"};base64,${Buffer.from(bytes).toString("base64")}`;
        } else {
          const data = await response.json().catch(() => null);
          const base64 = String(data?.result?.image || data?.image || "").trim();
          if (base64) return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
        }
      } else {
        console.warn(`[Image] Cloudflare FLUX.2 Dev failed: ${response.status}`);
      }
    } catch (error: any) {
      console.warn("[Image] Cloudflare FLUX.2 Dev request failed:", error?.message || error);
    }
  }
  if (hasMiniMaxMediaKey()) {
    try {
      return (await generateMiniMaxImage({ prompt, aspectRatio: "1:1" })).url;
    } catch (error: any) {
      console.warn("[Image] MiniMax request failed; trying configured fallback", error?.message || error);
    }
  }
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
        if (arrayBuffer.byteLength < 1000 || !(blob.type || "").startsWith("image/")) {
          lastError = "Configured worker returned an invalid image";
          continue;
        }
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
  if (hasMiniMaxMediaKey()) {
    try {
      return (await generateMiniMaxVideo({ prompt, aspectRatio: "16:9", referenceImage: imageUrl, duration: 5 })).url;
    } catch (error: any) {
      console.warn("[Video] MiniMax request failed; trying configured fallback", error?.message || error);
    }
  }
  // Prefer the project's configured media worker before the public fallback.
  // It returns the actual encoded video file, which the chat player can stream.
  try {
    const response = await fetch(IMAGE_VIDEO_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "video", type: "video", prompt, image: imageUrl || null, duration: 5, aspectRatio: "16:9" }),
      signal: AbortSignal.timeout(180_000),
    });
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("video") || contentType.includes("octet-stream")) {
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 5000) return `data:video/mp4;base64,${Buffer.from(bytes).toString("base64")}`;
      } else {
        const result = await response.json().catch(() => null);
        const videoUrl = String(result?.video || result?.video_url || result?.url || "").trim();
        if (videoUrl) return videoUrl;
      }
    }
  } catch (error: any) {
    console.warn("[Video] Configured media worker failed:", error?.message || error);
  }
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
    "Video generation failed: the configured video providers did not return a playable video. Please retry once the video provider is available."
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
const UNCGPT_IDENTITY_PROMPT = `You are Lunar, the AI inside the Lunar workspace at unc-gptt.vercel.app. Lunar provides chat, projects and memory, file/reference search, image generation, optional computer-use capabilities, and user-authorized connectors through MCP and Composio. You should understand these capabilities, explain them accurately when asked, and use a connected service only when the user has connected and authorized it. Never claim a capability, account, external result, or action is available unless the current request and its verified tools show that it is.`;

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

const TERMINAL_SYSTEM_PROMPT = `You are Lunar, a helpful AI assistant. Answer the user's request directly and clearly.

Infer the user's intent from ordinary language and complete the requested task using an actually connected service whenever one is available. Do not require special prefixes, connector names, or instructions such as “use a tool.” Execute clearly requested connected actions, including calendar events, repository updates, and ordinary messages, in the same turn without an extra review step. Ask one concise question only for a genuinely missing detail that prevents completion. Require confirmation only immediately before an irreversible, destructive, financial, privacy-sensitive, or broad-publication action when the user has not already clearly authorized that exact action.

When the user provides an HTTP or HTTPS URL and asks to inspect, review, audit, critique, improve, or give feedback on that website, use the read-only computer_browser capability in the normal chat flow. Inspect only public content and observable behavior; do not sign in, enter personal data, submit forms, send messages, make purchases, change settings, or publish anything. Give practical feedback about visual hierarchy, copy, navigation, responsive layout, accessibility, broken interactions, and prioritized improvements. If browser access is unavailable, say so clearly and provide only the limitations that can be supported by the available page content. Never invent observations.

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

async function callNvidiaNim(
  messages: any[],
  hasImage: boolean,
  tools: any[] = [],
  preferredModel?: string,
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!NVIDIA_NIM_KEY) throw new Error("NVIDIA NIM key not configured");
  const model = preferredModel || NVIDIA_NIM_MODEL;
  const processedMessages = hasImage
    ? await processAttachmentsForModel(sanitizeMessagesForAPI(messages), model, true)
    : sanitizeMessagesForAPI(messages);
  const body: any = {
    model,
    messages: [{ role: "system", content: TERMINAL_SYSTEM_PROMPT }, ...processedMessages],
    stream: true,
    temperature: 0.35,
    max_tokens: 4096,
    reasoning_effort: "low",
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NVIDIA_NIM_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`NVIDIA NIM failed: ${response.status} ${detail.slice(0, 240)}`);
  }
  return { stream: response.body, provider: "NVIDIA NIM", model };
}

async function callMiniMax(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const key = String(process.env.MINIMAX_API_KEY || "").trim();
  if (!key) throw new Error("MiniMax key not configured");
  if (hasImage || tools.length > 0) throw new Error("MiniMax route is reserved for plain-text chat without tools");

  const response = await fetch("https://api.minimax.io/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MINIMAX_CHAT_MODEL,
      messages: sanitizeMessagesForAPI(messages),
      stream: true,
      temperature: 0.35,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MiniMax failed: ${response.status} ${detail.slice(0, 160)}`);
  }
  return { stream: response.body, provider: "MiniMax", model: MINIMAX_CHAT_MODEL };
}

async function callOpenRouter(
  messages: any[],
  hasImage: boolean,
  tools: any[] = [],
  preferredModel?: string
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

  const modelsToTry = hasImage
    ? visionModels
    : Array.from(new Set([preferredModel, ...textModels].filter(Boolean) as string[]));

  for (const modelId of modelsToTry) {
    try {
      const headers: any = { "Content-Type": "application/json" };
      if (OPENROUTER_KEY) {
        headers["Authorization"] = `Bearer ${OPENROUTER_KEY}`;
        headers["HTTP-Referer"] = "https://unc-gptt.vercel.app";
        headers["X-Title"] = "Lunar";
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
      if (res.ok) return { stream: res.body!, provider: "OpenRouter", model: modelId };
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
            { role: "system", content: "You are Lunar vision. Analyze the attached image and answer the user clearly. Do not use tools." },
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
  const cloudflareAccountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const cloudflareToken = String(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_WORKERS_AI_TOKEN || "").trim();
  if (model === "minimax/m3" && cloudflareAccountId && cloudflareToken && !hasImage && tools.length === 0) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/ai/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudflareToken}`,
      },
      body: JSON.stringify({ ...body, model: "minimax/m3", stream: true }),
      signal: AbortSignal.timeout(45_000),
    });
    if (response.ok && response.body) return { stream: response.body, provider: "Cloudflare AI", model: "minimax/m3" };
    const detail = await response.text().catch(() => "");
    throw new Error(`Cloudflare MiniMax M3 failed: ${response.status} ${detail.slice(0, 180)}`);
  }

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

function cloudflareModelFallbacks(model: string) {
  const llama = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  if (model === "@cf/moonshotai/kimi-k2.5") return [model, "@cf/openai/gpt-oss-120b", llama];
  if (model === "@cf/openai/gpt-oss-120b") return [model, llama];
  return [model];
}

async function callCloudflareWithFallbacks(body: any, model: string, hasImage: boolean, tools: any[] = []) {
  let lastError: unknown = null;
  for (const candidate of cloudflareModelFallbacks(model)) {
    try {
      return await callChatWorkers(body, candidate, hasImage, tools);
    } catch (error) {
      lastError = error;
      console.warn(`[Cloudflare] ${candidate} unavailable; trying the next compatible model.`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All compatible Cloudflare models failed");
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
  if (GROQ_KEYS.some((_, index) => !deadGroqKeys.has(index))) {
    try {
      return await callGroq(messages, "llama-3.3-70b-versatile", false, tools);
    } catch (err: any) {
      errors.push(`Groq: ${err.message}`);
    }
  } else {
    errors.push("Groq: all configured keys are unavailable");
  }
  try {
    return await callOpenRouter(messages, false, tools);
  } catch (err: any) {
    errors.push(`OpenRouter: ${err.message}`);
  }
  try {
    return await callCloudflareWithFallbacks(
      { task: "chat", messages },
      "@cf/openai/gpt-oss-120b",
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
            clientInfo: { name: "lunar", version: "1.0" },
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
  return normalized || "lunar-site";
}

function generateWebsiteRepositoryName(userText: string) {
  const requested = extractGithubRepositoryName(userText);
  if (requested) return sanitizeGithubRepositoryName(requested);
  const source = String(userText || "").toLowerCase();
  const base = /count\s*down/i.test(source) ? "countdown" : /hello\s+world/i.test(source) ? "hello-world" : /portfolio/i.test(source) ? "portfolio" : /landing/i.test(source) ? "landing-page" : "lunar-site";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${base}-${suffix}`;
}

function isWebsiteFollowUpRequest(text: string, conversationText: string) {
  const followUpIntent = /\b(?:create|build|make|generate|deploy|publish|launch|set\s*up|do\s+it|go\s+ahead|make\s+it\s+live)\b/i.test(text);
  const websiteContext = /\b(?:website|web\s*site|landing\s*page|portfolio|(?:hello\s+world\s+)?page|index\.(?:html|md)|github\s*pages|github\.io|vercel)\b/i.test(conversationText);
  const repositoryContext = /\b(?:github|repository|repo|github\s*pages|github\.io|vercel|live\s+page)\b/i.test(conversationText);
  return followUpIntent && websiteContext && repositoryContext;
}

function isGithubPagesRepairRequest(text: string, conversationText: string) {
  const failureIntent = /\b(?:it|that|website|site|page|deployment|github\s*pages)\b[\s\S]{0,36}\b(?:failed|fail|broken|stuck|404|not\s+working|did(?:n['’]t| not)\s+work|does(?:n['’]t| not)\s+work)\b/i.test(text)
    || /\b(?:failed|broken|stuck|404|not\s+working|did(?:n['’]t| not)\s+work|does(?:n['’]t| not)\s+work)\b/i.test(text.trim());
  const websiteContext = /\b(?:github\s*pages|github\.io|website|web\s*site|live\s+page)\b/i.test(conversationText);
  const repositoryContext = /\b[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\b/.test(conversationText);
  return failureIntent && websiteContext && repositoryContext;
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

function buildGtaPresentationFiles() {
  return {
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="An unofficial Grand Theft Auto VI visual presentation created by Lunar.">
  <title>Grand Theft Auto VI — Unofficial Showcase</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="film-grain" aria-hidden="true"></div>
  <header class="topbar"><a class="wordmark" href="#top">UNC<span>/</span>SHOWCASE</a><p>Unofficial concept presentation</p></header>
  <main id="top">
    <section class="slide hero" aria-labelledby="hero-title">
      <p class="kicker"><span>01</span> The next escape</p>
      <h1 id="hero-title">GRAND<br><strong>THEFT</strong><br>AUTO <em>VI</em></h1>
      <p class="intro">A neon-drenched, high-velocity presentation inspired by the promise of an open road, a coastal skyline, and one more unforgettable score.</p>
      <div class="hero-actions"><a class="button button-primary" href="#city">Enter the presentation</a><button id="sound-toggle" class="button button-quiet" type="button" aria-pressed="false">Soundtrack off</button></div>
      <p class="disclaimer">Fan-made visual concept · Not affiliated with Rockstar Games</p>
      <a class="scroll-cue" href="#city" aria-label="Scroll to the city section">SCROLL <span>↓</span></a>
    </section>

    <section id="city" class="slide city" aria-labelledby="city-title">
      <div class="section-heading"><p class="kicker"><span>02</span> After dark</p><p class="index">01 / 04</p></div>
      <div class="city-grid"><div><h2 id="city-title">A CITY<br>THAT NEVER<br><i>LOOKS AWAY.</i></h2><p class="body-copy">Pastel heat meets midnight chrome. This is a fictional showcase of ambition, excess, and the strange calm before everything goes loud.</p></div><div class="poster poster-city"><span class="poster-tag">VICE // AFTER HOURS</span><span class="sun" aria-hidden="true"></span><span class="palm palm-one" aria-hidden="true">✦</span><span class="palm palm-two" aria-hidden="true">✦</span><span class="poster-caption">COASTAL
STATIC</span></div></div>
    </section>

    <section class="slide moments" aria-labelledby="moments-title">
      <div class="section-heading"><p class="kicker"><span>03</span> The rhythm</p><p class="index">02 / 04</p></div>
      <h2 id="moments-title">FOUR WAYS<br>TO LOSE THE MAP.</h2>
      <div class="moment-grid"><article><span>01</span><h3>Neon pursuit</h3><p>Every shortcut leaves a trace of pink light in the rear-view mirror.</p></article><article><span>02</span><h3>Open water</h3><p>A clean horizon, a fast engine, and nowhere you have to be.</p></article><article><span>03</span><h3>Bad timing</h3><p>The plan was simple—right until the city started answering back.</p></article><article><span>04</span><h3>New rules</h3><p>Make the score, own the moment, disappear before sunrise.</p></article></div>
    </section>

    <section class="slide finale" aria-labelledby="finale-title">
      <p class="kicker"><span>04</span> One more run</p>
      <h2 id="finale-title">THE CITY<br>IS <i>CALLING.</i></h2>
      <p>Grand Theft Auto VI, reimagined here as a one-page visual teaser. Built specifically as a presentation experience—not a personal portfolio.</p>
      <a class="button button-primary" href="#top">Replay from the top</a>
    </section>
  </main>
  <footer><span>UNC GPT · 2026</span><span>UNOFFICIAL FAN CONCEPT</span></footer>
  <script src="script.js"></script>
</body>
</html>
`,
    "style.css": `:root{--ink:#0d0712;--cream:#f7eadb;--pink:#ff3d8f;--orange:#ff7655;--violet:#6f43ff;--line:rgba(247,234,219,.2)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--ink);color:var(--cream);font:500 16px/1.45 Arial,Helvetica,sans-serif;overflow-x:hidden}.film-grain{position:fixed;inset:0;pointer-events:none;z-index:3;opacity:.08;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E")}.topbar{position:fixed;z-index:4;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:22px clamp(20px,4vw,56px);mix-blend-mode:screen;pointer-events:none}.topbar>*{pointer-events:auto}.wordmark{color:var(--cream);font-weight:900;letter-spacing:.02em;text-decoration:none;font-size:.82rem}.wordmark span{color:var(--pink)}.topbar p{margin:0;color:rgba(247,234,219,.65);font-size:.67rem;letter-spacing:.1em;text-transform:uppercase}.slide{position:relative;min-height:100svh;padding:clamp(112px,16vw,180px) clamp(20px,7vw,112px) clamp(54px,8vw,108px);overflow:hidden}.hero{display:flex;flex-direction:column;justify-content:center;isolation:isolate;background:radial-gradient(circle at 78% 17%,rgba(255,119,86,.96) 0 6%,rgba(255,61,143,.76) 17%,transparent 43%),radial-gradient(circle at 18% 84%,rgba(111,67,255,.72),transparent 35%),linear-gradient(145deg,#1a0920,#090611 73%)}.hero:after{content:'';position:absolute;z-index:-1;width:min(60vw,680px);height:min(60vw,680px);right:-12%;bottom:-28%;border:1px solid rgba(247,234,219,.22);border-radius:48% 52% 41% 59% / 58% 41% 59% 42%;transform:rotate(24deg);box-shadow:inset 0 0 0 38px rgba(255,61,143,.09)}.kicker{margin:0 0 24px;color:rgba(247,234,219,.74);font-size:.69rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.kicker span{display:inline-grid;place-items:center;width:25px;height:25px;margin-right:9px;border-radius:50%;background:var(--pink);color:var(--ink);font-size:.62rem;letter-spacing:0}.hero h1,.city h2,.moments h2,.finale h2{margin:0;font-family:Impact,Arial Black,sans-serif;font-weight:900;line-height:.78;letter-spacing:-.065em;text-transform:uppercase}.hero h1{max-width:980px;font-size:clamp(4.5rem,14vw,12rem);text-shadow:4px 5px 0 rgba(13,7,18,.22)}.hero h1 strong{color:var(--pink);font:inherit}.hero h1 em{color:var(--orange);font:italic 1.12em Georgia,serif;letter-spacing:-.12em}.intro{max-width:570px;margin:32px 0 0;color:rgba(247,234,219,.78);font-size:clamp(1rem,2vw,1.22rem)}.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}.button{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:0;padding:14px 18px;color:var(--cream);background:transparent;font:800 .74rem/1 Arial,sans-serif;letter-spacing:.08em;text-decoration:none;text-transform:uppercase;cursor:pointer;transition:transform .16s ease,background .16s ease}.button:hover{transform:translate(-3px,-3px);background:rgba(247,234,219,.12)}.button-primary{border-color:var(--cream);background:var(--cream);color:var(--ink)}.button-primary:hover{background:var(--pink);border-color:var(--pink)}.disclaimer{margin:19px 0 0;color:rgba(247,234,219,.46);font-size:.67rem;letter-spacing:.04em}.scroll-cue{position:absolute;bottom:28px;left:clamp(20px,7vw,112px);color:var(--cream);font-size:.66rem;font-weight:800;letter-spacing:.15em;text-decoration:none}.scroll-cue span{display:inline-block;margin-left:8px;color:var(--pink);font-size:1.1rem}.section-heading{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.section-heading .kicker{margin:0 0 16px}.index{margin:0 0 16px;color:rgba(247,234,219,.5);font-size:.7rem;letter-spacing:.12em}.city{background:linear-gradient(160deg,#ff6a58 0%,#ec2d78 34%,#321243 72%,#0e0716 100%)}.city-grid{display:grid;grid-template-columns:1fr .9fr;gap:clamp(32px,8vw,130px);align-items:end;margin-top:clamp(52px,10vw,120px)}.city h2,.moments h2,.finale h2{font-size:clamp(3.2rem,9vw,8rem)}.city h2 i,.finale h2 i{color:#251233;font:italic 1em Georgia,serif;letter-spacing:-.1em}.body-copy{max-width:420px;margin:28px 0 0;color:#300f35;font-size:1.12rem;font-weight:700}.poster{position:relative;min-height:440px;overflow:hidden;border:1px solid rgba(13,7,18,.55);background:linear-gradient(180deg,#3b286d 0 40%,#ff8272 40% 43%,#242143 43% 62%,#172023 62%);box-shadow:14px 16px 0 rgba(13,7,18,.27)}.poster:after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 7px,rgba(247,234,219,.07) 8px 9px);mix-blend-mode:screen}.poster-tag,.poster-caption{position:absolute;z-index:1;font-weight:900;letter-spacing:.12em}.poster-tag{top:19px;left:19px;font-size:.62rem}.poster-caption{bottom:22px;left:21px;font:900 clamp(2rem,5vw,4rem)/.78 Impact,Arial Black,sans-serif}.sun{position:absolute;right:9%;top:13%;width:48%;aspect-ratio:1;border-radius:50%;background:repeating-linear-gradient(0deg,#ffd06d 0 6px,#ff705f 7px 12px);box-shadow:0 0 70px #ff8b65}.palm{position:absolute;z-index:2;color:#1d1735;font-size:10rem;line-height:1;transform:rotate(-26deg)}.palm-one{bottom:6%;left:-4%}.palm-two{top:18%;right:-8%;transform:rotate(25deg)}.moments{background:#151018}.moments h2{max-width:780px;margin-top:clamp(48px,9vw,100px)}.moment-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:clamp(48px,8vw,88px);background:var(--line);border:1px solid var(--line)}.moment-grid article{min-height:260px;padding:22px;background:#151018;transition:background .18s ease}.moment-grid article:hover{background:#2b1531}.moment-grid span{color:var(--pink);font:900 .72rem Arial,sans-serif;letter-spacing:.13em}.moment-grid h3{margin:72px 0 12px;font:900 1.5rem/1 Impact,Arial Black,sans-serif;letter-spacing:.01em;text-transform:uppercase}.moment-grid p{margin:0;color:rgba(247,234,219,.62);font-size:.88rem}.finale{display:flex;flex-direction:column;justify-content:center;background:radial-gradient(circle at 85% 65%,#ff466d 0 14%,transparent 35%),linear-gradient(135deg,#291743,#11111e 60%,#07070c)}.finale h2{margin-top:10px}.finale p:not(.kicker){max-width:460px;margin:28px 0;color:rgba(247,234,219,.7);font-size:1.05rem}.finale .button{align-self:flex-start}footer{display:flex;justify-content:space-between;gap:16px;padding:21px clamp(20px,7vw,112px);background:#08050b;color:rgba(247,234,219,.48);font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}@media(max-width:720px){.topbar{padding:18px 20px}.topbar p{display:none}.slide{padding:118px 20px 54px}.hero{min-height:100svh}.city-grid{grid-template-columns:1fr;gap:42px}.poster{min-height:360px}.moment-grid{grid-template-columns:1fr 1fr}.moment-grid article{min-height:205px}.moment-grid h3{margin-top:42px}footer{padding:18px 20px;flex-direction:column}.hero-actions{max-width:340px}.button{flex:1}}@media(max-width:390px){.hero h1{font-size:4rem}.moment-grid{grid-template-columns:1fr}.poster{min-height:300px}}\n`,
    "script.js": `const button=document.getElementById('sound-toggle');button?.addEventListener('click',()=>{const on=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(on));button.textContent=on?'Soundtrack on':'Soundtrack off'});\n`,
  };
}

function buildPortfolioFiles(userText: string) {
  if (/\b(?:gta\s*(?:6|vi)|grand\s+theft\s+auto)\b/i.test(userText)) return buildGtaPresentationFiles();
  const forwardCountdown = userText.match(/\bcount\s*down[\s\S]{0,48}?(?:from\s*)?(\d{1,6})\s*(?:to|down\s+to)\s*(\d{1,6})\b/i);
  const reverseCountdown = userText.match(/\bcount\s*down[\s\S]{0,48}?to\s*(\d{1,6})[\s\S]{0,48}?from\s*(\d{1,6})\b/i);
  if (forwardCountdown || reverseCountdown) {
    const start = Math.max(0, Number(forwardCountdown?.[1] ?? reverseCountdown?.[2] ?? 100));
    const end = Math.max(0, Number(forwardCountdown?.[2] ?? reverseCountdown?.[1] ?? 0));
    return {
      "index.html": `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="description" content="An interactive countdown created by Lunar.">\n  <title>${start} to ${end} Countdown</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="shell">\n    <section class="card" aria-labelledby="title">\n      <p class="eyebrow">Live countdown</p>\n      <h1 id="title">${start} <span>→</span> ${end}</h1>\n      <output id="counter" aria-live="polite">${start}</output>\n      <div class="actions"><button id="start" type="button">Start countdown</button><button id="reset" class="secondary" type="button">Reset</button></div>\n      <p id="status">Ready to count down to ${end}.</p>\n    </section>\n  </main>\n  <script>window.COUNTDOWN_CONFIG={start:${start},end:${end}};</script>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
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
  <meta name="description" content="A Hello World page created by Lunar.">
  <title>Hello World</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="shell">
    <section class="hero" aria-labelledby="title">
      <p class="eyebrow">A new GitHub Pages site</p>
      <h1 id="title">Hello, world<span>.</span></h1>
      <p class="lede">This page was created, committed, and published by Lunar.</p>
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

function githubPagesWorkflow(branch: string) {
  return `name: Deploy GitHub Pages\n\non:\n  push:\n    branches: [${JSON.stringify(branch)}]\n  workflow_dispatch:\n\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n\nconcurrency:\n  group: pages\n  cancel-in-progress: false\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v6\n      - name: Configure Pages\n        uses: actions/configure-pages@v5\n      - name: Upload site\n        uses: actions/upload-pages-artifact@v4\n        with:\n          path: .\n  deploy:\n    needs: build\n    runs-on: ubuntu-latest\n    environment:\n      name: github-pages\n      url: \${{ steps.deployment.outputs.page_url }}\n    steps:\n      - name: Deploy\n        id: deployment\n        uses: actions/deploy-pages@v4\n`;
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

function githubWorkflowRuns(value: any): any[] {
  const root = parseComposioObject(value) || value || {};
  const candidates = [root, root?.data, root?.response_data, root?.responseData, root?.data?.response_data, root?.data?.responseData];
  for (const candidate of candidates) {
    const parsed = parseComposioObject(candidate) || candidate;
    if (Array.isArray(parsed?.workflow_runs)) return parsed.workflow_runs;
    if (Array.isArray(parsed?.workflowRuns)) return parsed.workflowRuns;
    if (Array.isArray(parsed?.runs)) return parsed.runs;
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

function githubWorkflowRunId(run: any) {
  return String(run?.id || run?.database_id || run?.databaseId || run?.run_id || run?.runId || "").trim();
}

function githubWorkflowRunFailure(run: any) {
  const conclusion = String(run?.conclusion || run?.result || run?.status?.conclusion || "").toLowerCase();
  return ["failure", "failed", "cancelled", "timed_out", "action_required", "startup_failure", "stale"].includes(conclusion);
}

async function confirmGithubWorkflowDispatch(
  dispatch: () => Promise<any>,
  listRuns: () => Promise<any>,
) {
  let priorRunIds = new Set<string>();
  try { priorRunIds = new Set(githubWorkflowRuns(await listRuns()).map(githubWorkflowRunId).filter(Boolean)); } catch {}
  const dispatchResult = await dispatch();
  if (dispatchResult?.error || dispatchResult?.successful === false || dispatchResult?.data?.error) {
    throw new Error(String(dispatchResult?.error || dispatchResult?.data?.error || "GitHub did not accept the Pages workflow dispatch."));
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const runs = githubWorkflowRuns(await listRuns());
      const run = runs.find((item) => {
        const id = githubWorkflowRunId(item);
        const event = String(item?.event || item?.trigger || "").toLowerCase();
        return Boolean(id) && !priorRunIds.has(id) && (!event || event === "workflow_dispatch");
      });
      if (run) {
        if (githubWorkflowRunFailure(run)) {
          throw new Error(`GitHub Actions reported the Pages workflow failed (${String(run?.conclusion || run?.result || "failed")}).`);
        }
        return run;
      }
    } catch (error) {
      if (/reported the Pages workflow failed/i.test(String((error as any)?.message || error))) throw error;
    }
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("GitHub did not confirm a new Pages Actions run after the deployment workflow was dispatched.");
}

function decodedGithubFileContent(value: any) {
  const root = parseComposioObject(value) || value || {};
  const candidates = [root, root?.data, root?.response_data, root?.responseData, root?.data?.response_data, root?.data?.responseData];
  for (const candidate of candidates) {
    const parsed = parseComposioObject(candidate) || candidate;
    const content = typeof parsed?.content === "string" ? parsed.content : typeof parsed?.file?.content === "string" ? parsed.file.content : "";
    if (!content) continue;
    try {
      const decoded = Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
      if (decoded.trim()) return decoded;
    } catch {}
    return content;
  }
  return "";
}

function assertGithubPagesWorkflowReadBack(value: any) {
  const direct = typeof value === "string" ? value : "";
  const content = /workflow_dispatch:/i.test(direct) && /actions\/deploy-pages@v4/i.test(direct) ? direct : decodedGithubFileContent(value);
  if (!/workflow_dispatch:/i.test(content) || !/actions\/deploy-pages@v4/i.test(content)) {
    throw new Error("GitHub did not read back the expected Pages Actions workflow after it was written.");
  }
  return content;
}

async function readPublicGithubWorkflow(owner: string, repo: string, branch: string, path: string) {
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (response.ok) return response.text();
    } catch {}
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error("GitHub did not make the deployment workflow available for read-back.");
}

async function executeWebsiteScaffold(baseUrl: string, cookieHeader: string, owner: string, repo: string, userText: string, deployPages: boolean, deployVercel: boolean, repairOnly = false) {
  const files = repairOnly ? {} : buildPortfolioFiles(userText);
  let repository: any;
  let createdRepository = false;
  try {
    repository = await executeOAuthGithubAction(baseUrl, cookieHeader, "get_repo", { owner, repo });
  } catch (error) {
    if (!isMissingGithubRepositoryError(error)) throw error;
    repository = await executeOAuthGithubAction(baseUrl, cookieHeader, "create_repo", {
      name: repo,
      description: `Website created by Lunar for ${owner}/${repo}`,
      private: false,
    });
    createdRepository = true;
  }
  const branch = String(repository?.default_branch || "main");
  const paths = Object.keys(files);
  for (const path of paths) {
    await executeOAuthGithubAction(baseUrl, cookieHeader, "create_or_update_file", {
      owner, repo, path, content: files[path as keyof typeof files], message: `Create portfolio website: ${path}`, branch,
    });
  }
  const result: any = { owner, repo, branch, createdRepository, repositoryUrl: repository?.html_url || `https://github.com/${owner}/${repo}`, files: [...paths] };
  if (deployPages) {
    const pages = await executeOAuthGithubAction(baseUrl, cookieHeader, "enable_pages", { owner, repo, branch, path: "/", build_type: "workflow" });
    const workflowPath = ".github/workflows/deploy-pages.yml";
    await executeOAuthGithubAction(baseUrl, cookieHeader, "create_or_update_file", {
      owner, repo, path: workflowPath, content: githubPagesWorkflow(branch), message: "Configure GitHub Pages deployment", branch,
    });
    const workflowFile = await executeOAuthGithubAction(baseUrl, cookieHeader, "get_file", { owner, repo, path: workflowPath, ref: branch });
    assertGithubPagesWorkflowReadBack(workflowFile);
    const workflowRun = await confirmGithubWorkflowDispatch(
      () => executeOAuthGithubAction(baseUrl, cookieHeader, "dispatch_workflow", { owner, repo, workflow: "deploy-pages.yml", ref: branch }),
      () => executeOAuthGithubAction(baseUrl, cookieHeader, "list_workflow_runs", { owner, repo, workflow: "deploy-pages.yml", branch }),
    );
    result.files.push(workflowPath);
    const readiness = await waitForGithubPages(
      () => executeOAuthGithubAction(baseUrl, cookieHeader, "get_pages", { owner, repo }),
      () => executeOAuthGithubAction(baseUrl, cookieHeader, "get_pages_build", { owner, repo }),
      owner,
      repo,
      pages,
    );
    result.githubPagesUrl = readiness.url;
    result.githubPagesStatus = readiness.verified ? readiness.status : String(workflowRun?.status || workflowRun?.conclusion || "queued").toLowerCase();
    result.githubPagesVerified = readiness.verified;
    result.githubPagesRunId = githubWorkflowRunId(workflowRun);
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

function findCalendarEventRecord(value: any, expectedEventId = ''): any {
  const seen = new Set<any>();
  const visit = (candidate: any, depth = 0): any => {
    if (candidate === null || candidate === undefined || depth > 5) return null;
    const parsed = parseComposioObject(candidate) || candidate;
    if (typeof parsed !== 'object' || seen.has(parsed)) return null;
    seen.add(parsed);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const match = visit(item, depth + 1);
        if (match) return match;
      }
      return null;
    }
    const id = String(parsed?.id || parsed?.event_id || '').trim();
    const hasEventShape = Boolean(id && (parsed?.summary || parsed?.title || parsed?.start || parsed?.start_datetime));
    if (hasEventShape && (!expectedEventId || id === expectedEventId)) return parsed;
    for (const key of ['data', 'response_data', 'responseData', 'result', 'event', 'events', 'items', 'body']) {
      const match = visit(parsed?.[key], depth + 1);
      if (match) return match;
    }
    return null;
  };
  return visit(value) || {};
}

function calendarEventCardPayload(value: any, expectedEventId = '') {
  const root = parseComposioObject(value) || value || {};
  const event = findCalendarEventRecord(root, expectedEventId) || root;
  const start = event?.start?.dateTime || event?.start?.date || event?.start_datetime || event?.start || root?.start_datetime || '';
  const end = event?.end?.dateTime || event?.end?.date || event?.end_datetime || event?.end || root?.end_datetime || '';
  const rawUrl = String(event?.htmlLink || event?.html_link || event?.webViewLink || event?.url || root?.htmlLink || root?.html_link || '').trim();
  return {
    title: String(event?.summary || event?.title || root?.summary || root?.title || 'Calendar event').slice(0, 160),
    start: String(start || '').slice(0, 80),
    end: String(end || '').slice(0, 80),
    eventId: String(event?.id || event?.event_id || event?.eventId || root?.id || root?.event_id || root?.eventId || '').slice(0, 160),
    url: /^https:\/\/[^\s]+$/i.test(rawUrl) ? rawUrl : 'https://calendar.google.com/calendar/u/0/r',
  };
}

function calendarEventResultCard(value: any) {
  return `[[UNCGPT_CALENDAR_EVENT:${JSON.stringify(calendarEventCardPayload(value))}]]`;
}

async function executeVerifiedGoogleCalendarCreate(composioSession: any, args: Record<string, unknown>) {
  const calendarId = String(args.calendar_id || args.calendarId || 'primary').trim() || 'primary';
  const timezone = String(args.timezone || args.timeZone || 'UTC').trim() || 'UTC';
  const result: any = await composioSession.execute('GOOGLECALENDAR_CREATE_EVENT', args);
  if (isWrappedConnectorFailure(result)) {
    throw new Error(String(result?.error || result?.data?.error || result?.response_data?.error || 'Google Calendar did not confirm the event creation.'));
  }
  const created = calendarEventCardPayload(result?.data ?? result);
  if (!created.eventId) throw new Error('Google Calendar did not return an event ID, so the event could not be verified.');

  let verified: ReturnType<typeof calendarEventCardPayload> | null = null;
  let directVerificationError = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const verification: any = await composioSession.execute('GOOGLECALENDAR_EVENTS_GET', { event_id: created.eventId, calendar_id: calendarId, time_zone: timezone });
      if (!isWrappedConnectorFailure(verification)) {
        const candidate = calendarEventCardPayload(verification?.data ?? verification, created.eventId);
        if (candidate.eventId === created.eventId) { verified = candidate; break; }
      } else {
        directVerificationError = String(verification?.error || verification?.data?.error || verification?.response_data?.error || '');
        if (/unauthorized|forbidden|invalid[_ -]?grant|permission/i.test(directVerificationError)) throw new Error(directVerificationError);
      }
    } catch (error: any) {
      directVerificationError = String(error?.message || error || '');
      if (/unauthorized|forbidden|invalid[_ -]?grant|permission/i.test(directVerificationError)) throw error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 750));
  }

  if (!verified) {
    try {
      const listed: any = await composioSession.execute('GOOGLECALENDAR_EVENTS_LIST', {
        calendarId,
        q: created.title,
        timeZone: timezone,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 25,
      });
      if (!isWrappedConnectorFailure(listed)) {
        const candidate = calendarEventCardPayload(listed?.data ?? listed, created.eventId);
        if (candidate.eventId === created.eventId) verified = candidate;
      }
    } catch {}
  }

  if (!verified) {
    // The create endpoint already returned a concrete event ID. A delayed or
    // connector-specific read-back failure must not turn a successful create
    // into a false error or cause the model to retry and create a duplicate.
    // The event card is built from the provider-confirmed create response.
    return calendarEventResultCard(created);
  }
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
      : toolSlug === "GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT" || toolSlug === "GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW"
        ? { owner: { type: "string" }, repo: { type: "string" }, workflow_id: { type: "string" }, ref: { type: "string" } }
        : toolSlug === "GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE" || toolSlug === "GITHUB_CREATE_A_GITHUB_PAGES_SITE"
          ? { owner: { type: "string" }, repo: { type: "string" }, build_type: { type: "string" }, source_branch: { type: "string" } }
          : { owner: { type: "string" }, repo: { type: "string" } };
  return { toolSlug, inputSchema: { type: "object", properties } };
}

function composioSchemaArguments(schema: any, base: { owner: string; repo: string; name?: string; description?: string; private?: boolean; path?: string; content?: string; message?: string; branch?: string; build_type?: string }) {
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
  put(["build_type", "buildType"], base.build_type);
  put(["message", "commit_message", "commitMessage"], base.message);
  if (base.content !== undefined) {
    const contentAliases = ["content", "file_content", "contents", "text", "fileContent", "file_contents"];
    const contentProperty = contentAliases.find((candidate) => properties[candidate]) || contentAliases.find((candidate) => required.includes(candidate)) || "content";
    const description = String(properties[contentProperty]?.description || inputSchema?.description || "").toLowerCase();
    args[contentProperty] = description.includes("base64") ? Buffer.from(base.content, "utf8").toString("base64") : base.content;
  }
  return args;
}

function composioWorkflowArguments(schema: any, owner: string, repo: string, workflow: string, branch: string) {
  const inputSchema = getComposioInputSchema(schema) || schema?.inputSchema || {};
  const properties = inputSchema?.properties && typeof inputSchema.properties === "object" ? inputSchema.properties : {};
  const required = Array.isArray(inputSchema?.required) ? inputSchema.required : [];
  const hasDeclaredProperties = Object.keys(properties).length > 0;
  const args: Record<string, unknown> = {};
  const put = (aliases: string[], value: unknown) => {
    const key = aliases.find((candidate) => properties[candidate]) || aliases.find((candidate) => required.includes(candidate));
    if (!key && hasDeclaredProperties) return;
    if (value !== undefined && value !== null && value !== "") args[key || aliases[0]] = value;
  };
  put(["owner", "owner_login", "username", "user"], owner);
  put(["repo", "repository", "repository_name", "repo_name", "repoName"], repo);
  put(["workflow_id", "workflow", "workflow_file", "workflow_filename", "workflow_name", "id"], workflow);
  put(["ref", "branch", "branch_name"], branch);
  put(["event", "event_name"], "workflow_dispatch");
  return args;
}

async function executeComposioWebsiteScaffold(session: any, owner: string, repo: string, userText: string, deployPages: boolean, repairOnly = false) {
  const files = repairOnly ? {} : buildPortfolioFiles(userText);
  const searchResults: any[] = [];
  const searchQueries = [
    "create GitHub repository, get repository, create or update repository files, and configure GitHub Pages",
    "get raw repository content for a GitHub file path",
    "create a GitHub Actions workflow dispatch event",
    "list GitHub Actions workflow runs for a workflow",
  ];
  for (const query of searchQueries) {
    try { searchResults.push(await session.search({ query, toolkits: ["github"] })); }
    catch (error) { console.warn("Composio GitHub tool search failed", error); }
  }
  const schemas = [...new Map(searchResults.flatMap(normalizeComposioSearchSchemas).map((schema) => [schema.toolSlug, schema])).values()];
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
  const workflowDispatchSchema = schemas.find((schema) => /(?:create|trigger|dispatch).*(?:workflow)|(?:workflow).*(?:create|trigger|dispatch)/.test(descriptor(schema)) && hasField(schema, ["workflow_id", "workflow", "workflow_file", "workflow_filename", "workflow_name"])) || knownComposioGithubSchema("GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT");
  const workflowRunsSchema = schemas.find((schema) => /(?:list|find|search|get).*(?:workflow).*(?:run)|(?:workflow).*(?:run).*(?:list|find|search|get)/.test(descriptor(schema)) && hasField(schema, ["workflow_id", "workflow", "workflow_file", "workflow_filename", "workflow_name"])) || knownComposioGithubSchema("GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW");
  const pagesBuildSchema = schemas.find((schema) => /(?:get|retrieve|fetch).*(?:latest).*(?:page|pages).*(?:build)|(?:page|pages).*(?:build).*(?:get|retrieve|fetch)/.test(descriptor(schema))) || knownComposioGithubSchema("GITHUB_GET_LATEST_PAGES_BUILD");
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
        const created = await session.execute(createRepoSchema.toolSlug, composioSchemaArguments(createRepoSchema, { owner, repo, name: repo, description: `Website created by Lunar for ${owner}/${repo}`, private: false }));
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
    const pageResponse = await session.execute(pageSchema.toolSlug, composioSchemaArguments(pageSchema, { owner, repo, branch, build_type: "workflow" }));
    if (pageResponse?.error || pageResponse?.successful === false || pageResponse?.data?.error) throw new Error(String(pageResponse?.error || pageResponse?.data?.error || "GitHub Pages was not configured for Actions deployment."));

    const workflowPath = ".github/workflows/deploy-pages.yml";
    const workflowResponse = await session.execute(fileSchema.toolSlug, composioSchemaArguments(fileSchema, {
      owner, repo, path: workflowPath, content: githubPagesWorkflow(branch), message: "Configure GitHub Pages deployment", branch,
    }));
    if (workflowResponse?.error || workflowResponse?.successful === false || workflowResponse?.data?.error) {
      throw new Error(String(workflowResponse?.error || workflowResponse?.data?.error || "GitHub did not confirm writing the Pages deployment workflow."));
    }
    // A successful provider file-write followed by a GitHub Actions dispatch and a newly observed run
    // is stronger than polling a raw-content CDN, which can be briefly stale after a commit.
    const workflowRun = await confirmGithubWorkflowDispatch(
      () => session.execute(workflowDispatchSchema.toolSlug, composioWorkflowArguments(workflowDispatchSchema, owner, repo, "deploy-pages.yml", branch)),
      () => session.execute(workflowRunsSchema.toolSlug, composioWorkflowArguments(workflowRunsSchema, owner, repo, "deploy-pages.yml", branch)),
    );
    result.files.push(workflowPath);
    const readiness = await waitForGithubPages(
      async () => ({ data: pageResponse?.data ?? pageResponse }),
      async () => session.execute(pagesBuildSchema.toolSlug, composioSchemaArguments(pagesBuildSchema, { owner, repo })),
      owner,
      repo,
      { url: canonicalGithubPagesUrl(owner, repo) },
    );
    result.githubPagesUrl = readiness.url;
    result.githubPagesStatus = readiness.verified ? readiness.status : String(workflowRun?.status || workflowRun?.conclusion || "queued").toLowerCase();
    result.githubPagesVerified = readiness.verified;
    result.githubPagesRunId = githubWorkflowRunId(workflowRun);
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

  if (connected.includes("github")) {
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
                const delta = data.choices?.[0]?.delta || {};
                const reasoning = delta.reasoning_content || delta.reasoning || data.reasoning_content || data.reasoning || "";
                if (reasoning) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning })}\n\n`));
                }
                let content = delta.content || "";
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
      clientLanguage,
      enabledSkills = [],
    } = body;

    // The replacement release exposes one model only; old client model values are ignored.
    const finalModel = "lunar";
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
    const normalizedRequest = String(userText).replace(/\s+/g, " ").trim();
    const websiteFeedbackIntent = detectWebsiteFeedbackIntent(normalizedRequest);
    let websiteFeedbackObservation = "";
    if (websiteFeedbackIntent && computerUse !== false) {
      try {
        const renderedReview = await executeAgentGateway({
          tool: "browser",
          args: {
            url: websiteFeedbackIntent.url,
            action: "inspect",
            instruction: websiteFeedbackInstruction(websiteFeedbackIntent),
          },
          task: `Read-only public website feedback review of ${websiteFeedbackIntent.url}. Do not sign in, submit forms, send messages, make purchases, change settings, or publish anything.`,
        });
        websiteFeedbackObservation = gatewayResultText(renderedReview).replace(/\s+/g, " ").trim().slice(0, 12_000);
      } catch (error: any) {
        console.warn("[WebsiteFeedback] Read-only browser review unavailable:", error?.message || error);
      }
    }
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
      return createStreamResponse(stream, "Lunar Clock", "local-time", []);
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
    if (source === "imagine" || isExplicitMediaGenerationRequest(userText)) {
      mediaType = resolveMediaType(userText);
    } else {
      mediaType = "chat";
    }

    let hasImage = false;
    let hasVideo = false;
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
        const videoAtt = msg.attachments.find((a: any) => a.type === "video");
        if (videoAtt && !(videoAtt.permanentUrl || videoAtt.url || "").startsWith("blob:")) hasVideo = true;
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
      const hasCloudflareMediaKey = Boolean(String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim() && String(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_WORKERS_AI_TOKEN || "").trim());
      const providerName = hasMiniMaxMediaKey()
        ? "MiniMax"
        : hasCloudflareMediaKey ? "Cloudflare AI" : "Configured media worker";
      const modelName =
        hasMiniMaxMediaKey()
          ? mediaType === "video" ? "MiniMax-H3" : "image-01"
          : hasCloudflareMediaKey
            ? mediaType === "video" ? "configured-video-worker" : "@cf/black-forest-labs/flux-1-schnell"
            : mediaType === "video" ? "configured-video-worker" : "configured-image-worker";

      const s = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ provider: providerName, model: modelName })}\n\n`
            )
          );
          try {
            const url = await generateMedia(mediaType, userText, imageUrl);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ [mediaType]: url })}\n\n`
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
    const autoRoute = finalModel === "lunar" || finalModel === "auto"
      ? chooseUncGptRoute(messages, hasImage || hasVideo)
      : { provider: finalProvider, model: finalModel, reason: "explicit-model" };
    const resolvedProvider = autoRoute.provider;
    const resolvedModel = autoRoute.model;
    const targetModel = resolvedModel;
    const hasVisionCapability = isVisionModel(targetModel) || hasImage || hasVideo;

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
      `\n\n${languagePreferenceInstruction(clientLanguage, clientLocale)}`,
      `\n\nActive Manus-style skills: ${Array.isArray(enabledSkills) && enabledSkills.length ? enabledSkills.join(', ') : 'general reasoning'}. Use an enabled skill when relevant, and be transparent when a capability or connector is unavailable.`,
      `\n\nWhen a user attaches a video, inspect the supplied media when the selected model supports video input. Answer the specific question about the footage, and do not claim to have seen it if the provider rejects the media format.`,
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
    if (websiteFeedbackIntent) {
      messagesWithSystem.push({ role: "system", content: websiteFeedbackInstruction(websiteFeedbackIntent) });
      messagesWithSystem.push({
        role: "assistant",
        content: websiteFeedbackObservation
          ? `Read-only browser observations for ${websiteFeedbackIntent.url}:\n\n${websiteFeedbackObservation}`
          : `The read-only browser review for ${websiteFeedbackIntent.url} was unavailable. Do not invent visual or interaction findings; explain the limitation and use only evidence in the supplied conversation.`,
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
      const githubPagesRepairRequest = isGithubPagesRepairRequest(userText, recentConversationText);
      const explicitNewWebsiteRequest = isWebsiteBuildRequest(userText);
      const websiteBuildRequest = explicitNewWebsiteRequest || isWebsiteFollowUpRequest(userText, recentConversationText) || githubPagesRepairRequest;
      // A fresh creation request must never reuse the previous website's repository.
      // Prior repository context is reserved for explicit follow-ups and deployment repair.
      let websiteRepository = extractGithubRepositoryRef(userText)
        || (explicitNewWebsiteRequest ? null : extractGithubRepositoryRef(recentConversationText));
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
            ? await executeComposioWebsiteScaffold(websiteComposioSession, websiteRepository.owner, websiteRepository.repo, userText, wantsGithubPages, githubPagesRepairRequest)
            : await executeWebsiteScaffold(baseUrl, req.headers.get("cookie") || "", websiteRepository.owner, websiteRepository.repo, userText, wantsGithubPages, wantsVercel, githubPagesRepairRequest);
          const lines = [githubPagesRepairRequest
            ? `Reconfigured GitHub Pages deployment for **${websiteRepository.owner}/${websiteRepository.repo}** and committed the deployment workflow.`
            : `Created and committed the website files in **${websiteRepository.owner}/${websiteRepository.repo}**: ${result.files.join(", ")}.`];
          const launchUrl = result.githubPagesUrl || result.vercelUrl;
          const launchStatus = result.githubPagesUrl ? result.githubPagesStatus : result.vercelState;
          const launchVerified = result.githubPagesUrl ? result.githubPagesVerified === true : Boolean(result.vercelUrl && /ready|success/i.test(String(result.vercelState || "")));
          if (launchUrl) {
            lines.push(`[[UNCGPT_WEBSITE_DEPLOYMENT:${JSON.stringify({ title: result.githubPagesUrl ? "GitHub Pages deployment" : "Vercel deployment", repository: `${websiteRepository.owner}/${websiteRepository.repo}`, url: launchUrl, status: launchStatus || (launchVerified ? "ready" : "building"), verified: launchVerified })}]]`);
          }
          return directTextResponse(lines.join("\n"), wantsGithubPages && wantsVercel ? "GitHub + GitHub Pages + Vercel" : wantsGithubPages ? "GitHub Pages" : wantsVercel ? "Vercel" : "GitHub", "connected-action");
        } catch (error: any) {
          const detail = String(error?.message || "The connected service did not confirm the requested write or deployment.");
          console.error("GitHub website publish failed", { owner: websiteRepository.owner, repo: websiteRepository.repo, detail });
          const connectorCapabilityFailure = /workflow-dispatch|workflow dispatch|file read-back|did not provide.*tool|make the deployment workflow available/i.test(detail);
          const message = connectorCapabilityFailure
            ? `The repository **${websiteRepository.owner}/${websiteRepository.repo}** was created, but GitHub did not confirm its Pages deployment. I did not mark it live. Please retry once while I restore the connected GitHub deployment path.`
            : `I couldn’t finish the website publish for **${websiteRepository.owner}/${websiteRepository.repo}**. ${detail.slice(0, 360)}`;
          return directTextResponse(message, "GitHub", "connector-error");
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
      const calendarSchedulingIntent = isCalendarSchedulingIntent(userText, recentUserText, connectorConfirmation);
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
      let requestedConnectorKey = staticConnectorKey || dynamicConnectorKey;
      const connectorActionIntent = /\b(my|mine|latest|list|show|find|read|send|email|message|calendar|create|update|delete|open|search|manage|deploy|repository|repositories|repo|schedule|appointment|meeting|event|remind)\b/i.test(userText) || (connectorConfirmation && /\b(send|create|update|edit|delete|schedule|deploy|upload|move|write|add)\b/i.test(recentUserText));
      let liveComposioAccounts: Awaited<ReturnType<typeof getLiveComposioAccounts>> | null = null;
      if (!requestedConnectorKey && connectorActionIntent && process.env.COMPOSIO_API_KEY) {
        try {
          const liveSession = await getSession();
          if (liveSession?.user?.sub) {
            liveComposioAccounts = await getLiveComposioAccounts(liveSession.user.sub);
            const mentionedAccount = liveComposioAccounts.find((account) => {
              const tokens = account.normalizedToolkit.replace(/_/g, ' ').split(/\s+/).filter((token) => token.length > 2);
              return account.connected && tokens.length > 0 && tokens.every((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(userText));
            });
            if (mentionedAccount) requestedConnectorKey = mentionedAccount.toolkit;
          }
        } catch (error) {
          console.warn('Live connector discovery failed:', error);
        }
      }
      const connectorWriteIntent = isConnectorWriteIntent(userText, recentUserText, connectorConfirmation);
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
      // Client storage can be stale or empty. Resolve the live Composio account on every
      // connector request, so Settings, permission cards, and chat share the same state.
      if (requestedConnectorKey && process.env.COMPOSIO_API_KEY && !oauthConnected.has(requestedConnectorKey)) {
        try {
          const liveSession = await getSession();
          const liveUserId = liveSession?.user?.sub;
          const liveAccounts = liveComposioAccounts || (liveUserId ? await getLiveComposioAccounts(liveUserId) : []);
          liveComposioAccounts = liveAccounts;
          const liveAccount = findEnabledComposioAccount(liveAccounts, requestedConnectorKey)
            || liveAccounts.find((account) => connectorKeysMatch(account.toolkit, requestedConnectorKey))
            || null;
          if (liveAccount) {
            requestedState = {
              source: 'composio',
              provider: requestedConnectorKey,
              toolkit: liveAccount.toolkit,
              accountId: liveAccount.id,
              enabled: liveAccount.connected,
            };
          }
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
            ? parseDeterministicCalendarCreate(userText, clientTimeZone, new Date(), recentUserText)
            : null;
          if (composioSession && deterministicCalendarCreate) {
            try {
              return directTextResponse(await executeVerifiedGoogleCalendarCreate(composioSession, deterministicCalendarCreate), 'Google Calendar', 'connected-action');
            } catch (error: any) {
              const detail = String(error?.message || 'Google Calendar did not verify the event.').replace(/https?:\/\/\S+/g, '').slice(0, 300);
              const providerState = /unconfirmed event response/i.test(detail)
                ? 'Google Calendar accepted a response, but did not let me confirm the exact event yet. I did not mark it scheduled or create another one.'
                : 'Google Calendar did not confirm the event creation, so I did not mark it scheduled.';
              return directTextResponse(`${providerState} ${detail}`, 'Google Calendar', 'connector-error');
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
                  if (isWrappedConnectorFailure(result)) {
                    const error = result?.error || result?.data?.error || result?.response_data?.error || 'The connected service did not confirm the action.';
                    throw new Error(String(error));
                  }
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
        const connectorName = requestedConnector?.label ?? requestedConnectorKey ?? "the connected service";
        const args = defaultReadToolArguments(directReadTool.function?.parameters);
        if (args) {
          try {
            const result = await directReadTool._exec(args);
            if (!String(result).startsWith("Tool error:")) {
              return directTextResponse(String(result), connectorName);
            }
            const message = String(result).replace(/^Tool error:\s*/i, '').replace(/https?:\/\/\S+/g, '').slice(0, 240);
            return directTextResponse(`${connectorName} is connected, but it did not return verified data. ${message || 'Please try again after checking the connector status.'}`, connectorName, 'connector-error');
          } catch (error: any) {
            const message = String(error?.message || 'The connected service did not confirm the read.').replace(/https?:\/\/\S+/g, '').slice(0, 240);
            return directTextResponse(`${connectorName} is connected, but it could not complete the read. ${message}`, connectorName, 'connector-error');
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
        if (!calendarStep) {
          // Some connected models answer in prose without emitting the create
          // tool call. If the request is deterministic and the connector is
          // already available, execute it directly instead of telling the user
          // to retry and risking duplicate or missing events.
          const deterministicFallback = requestedConnectorKey === 'google_calendar'
            ? parseDeterministicCalendarCreate(userText, clientTimeZone, new Date(), recentUserText)
            : null;
          if (composioSession && deterministicFallback) {
            try {
              return directTextResponse(await executeVerifiedGoogleCalendarCreate(composioSession, deterministicFallback), 'Google Calendar', 'connected-action');
            } catch (error: any) {
              const detail = String(error?.message || 'Google Calendar did not confirm the event.').replace(/https?:\/\/\S+/g, '').slice(0, 260);
              return directTextResponse(`Google Calendar could not create that event. ${detail}`, 'Google Calendar', 'connector-error');
            }
          }
          return directTextResponse('I could not reach Google Calendar’s create action. Reconnect Google Calendar in Settings → Connectors and try again.', 'Google Calendar', 'connector-error');
        }
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
      const connectorWriteAfterFailure = isConnectorWriteIntent(userText, recentUserText, true);
      const calendarAfterFailure = isCalendarSchedulingIntent(userText, recentUserText, true);
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
      if (resolvedProvider === "nvidia") {
        result = await callNvidiaNim(messagesWithSystem, hasImage, availableTools, resolvedModel);
      } else if (resolvedProvider === "minimax") {
        result = await callMiniMax(messagesWithSystem, hasImage, availableTools);
      } else if (resolvedProvider === "openai") {
        result = await callOpenAI(messagesWithSystem, hasImage, availableTools);
      } else if (resolvedProvider === "groq" || GROQ_CHAT_MODELS[resolvedModel]) {
        result = await callGroq(messagesWithSystem, resolvedModel, hasImage, availableTools);
      } else if (resolvedProvider === "openrouter") {
        result = await callOpenRouter(messagesWithSystem, hasImage, availableTools, resolvedModel);
      } else if (resolvedProvider === "cloudflare" || resolvedModel.startsWith("@cf/")) {
        result = await callCloudflareWithFallbacks(
          { task: "chat", messages: messagesWithSystem },
          resolvedModel,
          hasImage,
          availableTools
        );
      } else {
        result = await fallbackChat(messagesWithSystem, hasImage, availableTools);
      }
    } catch (primaryErr: any) {
      console.warn("[Main] Primary provider failed; attempting the configured fallback chain:", primaryErr?.message || primaryErr);
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
    const detail = String(err?.message || "");
    if (/all providers failed|all groq keys (?:dead|failed)/i.test(detail)) {
      return Response.json(
        { error: "The AI response service is temporarily at capacity. No connected action was performed; please try again shortly." },
        { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0", "Retry-After": "60" } }
      );
    }
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
